import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '@/infra/prisma/prisma.service';

import { ROLES_KEY, RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  class ProtectedController {}
  const handler = () => undefined;

  Reflect.defineMetadata(ROLES_KEY, [Role.SUPERADMIN], handler);
  const guard = new RolesGuard(new Reflector());

  const contextFor = (role: Role) =>
    ({
      getHandler: () => handler,
      getClass: () => ProtectedController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;

  it('allows a required role', () => {
    expect(guard.canActivate(contextFor(Role.SUPERADMIN))).toBe(true);
  });

  it('rejects another role', () => {
    expect(() => guard.canActivate(contextFor(Role.ADMIN))).toThrow(ForbiddenException);
  });
});
