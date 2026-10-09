import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { verify } from 'argon2';

import { Role, type PrismaService } from '@/infra/prisma/prisma.service';
import type { RedisService } from '@/infra/redis/redis.service';

import { UserService } from './user.service';

const currentUserId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const existingUser = {
  id: otherUserId,
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: Role.ADMIN,
  password: '$argon2id$hash',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

type UserCreateData = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: Role;
};

describe('UserService management', () => {
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const del = jest.fn();
  const service = new UserService(
    { user: { findUnique, findMany, create, update, delete: remove } } as unknown as PrismaService,
    { del } as unknown as RedisService,
  );

  beforeEach(() => jest.resetAllMocks());

  it.each([Role.ADMIN, Role.SUPERADMIN])('creates and hashes a %s password', async (role) => {
    let createData: UserCreateData | undefined;
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }: { data: UserCreateData }) => {
      createData = data;

      return {
        id: otherUserId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        createdAt: existingUser.createdAt,
        updatedAt: existingUser.updatedAt,
      };
    });

    const user = await service.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'correct-horse-battery-staple',
      confirmPassword: 'correct-horse-battery-staple',
      role,
    });

    expect(user).toMatchObject({ email: 'ada@example.com', role });
    expect(createData).toBeDefined();
    expect(createData?.password).not.toBe('correct-horse-battery-staple');
    await expect(verify(createData?.password ?? '', 'correct-horse-battery-staple')).resolves.toBe(
      true,
    );
  });

  it('rejects a duplicate email before creating a user', async () => {
    findUnique.mockResolvedValue(existingUser);

    await expect(
      service.create({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: existingUser.email,
        password: 'correct-horse-battery-staple',
        confirmPassword: 'correct-horse-battery-staple',
        role: Role.ADMIN,
      }),
    ).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords before querying the database', async () => {
    await expect(
      service.create({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
        confirmPassword: 'another-password',
        role: Role.ADMIN,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('changes another user role and clears their auth cache', async () => {
    findUnique.mockResolvedValue(existingUser);
    update.mockResolvedValue({ ...existingUser, role: Role.SUPERADMIN });

    await expect(
      service.updateRole(currentUserId, otherUserId, { role: Role.SUPERADMIN }),
    ).resolves.toMatchObject({ role: Role.SUPERADMIN });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: otherUserId }, data: { role: Role.SUPERADMIN } }),
    );
    expect(del).toHaveBeenCalledWith(`user:id:${otherUserId}`);
  });

  it('blocks changing the current user role', async () => {
    await expect(
      service.updateRole(currentUserId, currentUserId, { role: Role.ADMIN }),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deletes another user and clears their auth cache', async () => {
    findUnique.mockResolvedValue(existingUser);
    remove.mockResolvedValue(existingUser);

    await expect(service.remove(currentUserId, otherUserId)).resolves.toMatchObject({
      id: otherUserId,
    });
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ where: { id: otherUserId } }));
    expect(del).toHaveBeenCalledWith(`user:id:${otherUserId}`);
  });

  it('blocks deleting the current user', async () => {
    await expect(service.remove(currentUserId, currentUserId)).rejects.toThrow(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });
});
