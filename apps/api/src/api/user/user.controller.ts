import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Authorization, CurrentUser } from '@/common/decorators';
import { Role } from '@/infra/prisma/prisma.service';

import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserService } from './user.service';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Authorization(Role.SUPERADMIN)
  @ApiOperation({ summary: 'List all users' })
  @Get()
  public findAll() {
    return this.userService.findAll();
  }

  @Authorization(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Create a user' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  public create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Authorization()
  @ApiOperation({ summary: "Update the current user's profile" })
  @Patch('me')
  public updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, updateProfileDto);
  }

  @Authorization()
  @ApiOperation({ summary: "Change the current user's password" })
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  public changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(userId, changePasswordDto);
  }

  @Authorization(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get a single user by id' })
  @Get(':id')
  public findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Authorization(Role.SUPERADMIN)
  @ApiOperation({ summary: "Change another user's role" })
  @Patch(':id/role')
  public updateRole(
    @CurrentUser('id') currentUserId: string,
    @Param('id') userId: string,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
  ) {
    return this.userService.updateRole(currentUserId, userId, updateUserRoleDto);
  }

  @Authorization(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete another user' })
  @Delete(':id')
  public remove(@CurrentUser('id') currentUserId: string, @Param('id') userId: string) {
    return this.userService.remove(currentUserId, userId);
  }
}
