import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';

import { PrismaService, UserModel } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';

import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

const USER_CACHE_TTL_SECONDS = 60;

@Injectable()
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  public async create({
    password,
    confirmPassword,
    email,
    ...userData
  }: CreateUserDto): Promise<User> {
    if (password !== confirmPassword) {
      throw new BadRequestException('Паролі не збігаються');
    }

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const user = await this.prismaService.user.create({
      data: { ...userData, email, password: await hash(password) },
      select: userSelect,
    });

    return user;
  }

  public async findAll(): Promise<User[]> {
    return await this.prismaService.user.findMany({
      select: userSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  public async findByEmail(email: string): Promise<UserWithPassword | null> {
    return this.prismaService.user.findUnique({
      where: { email },
      select: {
        ...userSelect,
        password: true,
      },
    });
  }

  public async findById(id: string): Promise<UserWithPassword> {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        password: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  public async findOne(id: string): Promise<User> {
    const user = await this.findById(id);

    return toSafeUser(user);
  }

  public async updateProfile(id: string, { firstName, lastName }: UpdateProfileDto): Promise<User> {
    const user = await this.prismaService.user.update({
      where: { id },
      data: { firstName, lastName },
      select: userSelect,
    });

    await this.redisService.del(`user:id:${id}`);

    return user;
  }

  public async changePassword(
    id: string,
    { currentPassword, newPassword, confirmPassword }: ChangePasswordDto,
  ): Promise<void> {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Нові паролі не збігаються');
    }

    const user = await this.findById(id);
    const passwordValid = await verify(user.password, currentPassword);

    if (!passwordValid) {
      throw new BadRequestException('Поточний пароль неправильний');
    }

    await this.prismaService.user.update({
      where: { id },
      data: { password: await hash(newPassword) },
      select: { id: true },
    });

    await this.redisService.del(`user:id:${id}`);
  }

  public async updateRole(
    currentUserId: string,
    userId: string,
    { role }: UpdateUserRoleDto,
  ): Promise<User> {
    this.assertDifferentUser(currentUserId, userId, 'змінювати власну роль');
    await this.findOne(userId);

    const user = await this.prismaService.user.update({
      where: { id: userId },
      data: { role },
      select: userSelect,
    });

    await this.redisService.del(`user:id:${userId}`);

    return user;
  }

  public async remove(currentUserId: string, userId: string): Promise<User> {
    this.assertDifferentUser(currentUserId, userId, 'видаляти самого себе');
    await this.findOne(userId);

    const user = await this.prismaService.user.delete({
      where: { id: userId },
      select: userSelect,
    });

    await this.redisService.del(`user:id:${userId}`);

    return user;
  }

  public async findByIdForAuth(id: string): Promise<User> {
    const user = await this.redisService.retrieve<User | null>({
      key: `user:id:${id}`,
      ttl: USER_CACHE_TTL_SECONDS,
      strategy: async () =>
        this.prismaService.user.findUnique({
          where: { id },
          select: userSelect,
        }),
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private assertDifferentUser(currentUserId: string, targetUserId: string, action: string): void {
    if (currentUserId === targetUserId) {
      throw new ForbiddenException(`Не можна ${action}`);
    }
  }
}

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

export type User = Pick<UserModel, keyof typeof userSelect>;
export type UserWithPassword = UserModel;

export function toSafeUser(user: UserWithPassword): User {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
