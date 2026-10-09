import { Role } from '@/infra/prisma/prisma.service';
import { ROLES_KEY } from '@/common/guards/roles.guard';

import { UserController } from './user.controller';

describe('UserController management access', () => {
  it.each(['findAll', 'create', 'findOne', 'updateRole', 'remove'])(
    'restricts %s to superadmins',
    (handlerName) => {
      const descriptor = Object.getOwnPropertyDescriptor(UserController.prototype, handlerName);
      const handler: unknown = descriptor?.value;

      if (typeof handler !== 'function') throw new Error(`Missing handler: ${handlerName}`);

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SUPERADMIN]);
    },
  );
});
