import '../src/config/load-env';

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { Pool } from 'pg';

import { PrismaClient, Role } from '../generated/prisma/client';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for seeding`);
  return value;
};

const pool = new Pool({ connectionString: required('DATABASE_URL') });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const seed = async () => {
  const email = required('SEED_USER_EMAIL').toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    console.log(`User ${email} already exists; skipped.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      password: await hash(required('SEED_USER_PASSWORD')),
      firstName: required('SEED_USER_FIRST_NAME'),
      lastName: required('SEED_USER_LAST_NAME'),
      role: Role.SUPERADMIN,
    },
  });

  console.log(`Created SUPERADMIN user ${email}.`);
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
