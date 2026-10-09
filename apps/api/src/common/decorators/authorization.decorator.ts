import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';

import { ACCESS_TOKEN_SECURITY_NAME } from '@/config/openapi';
import { ROLES_KEY, RolesGuard } from '@/common/guards/roles.guard';
import type { Role } from '@/infra/prisma/prisma.service';

export const Authorization = (...roles: Role[]) =>
  roles.length
    ? applyDecorators(
        UseGuards(AuthGuard('jwt'), RolesGuard),
        SetMetadata(ROLES_KEY, roles),
        ApiBearerAuth(ACCESS_TOKEN_SECURITY_NAME),
      )
    : applyDecorators(UseGuards(AuthGuard('jwt')), ApiBearerAuth(ACCESS_TOKEN_SECURITY_NAME));
