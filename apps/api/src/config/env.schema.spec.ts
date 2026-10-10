import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { environmentSchema, type Environment } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret',
  JWT_EXPIRATION_TIME: '2h',
  JWT_REFRESH_EXPIRATION_TIME: '7d',
  TELEGRAM_BOT_API_TOKEN: 'test-token',
  OPENAI_API_KEY: 'test-key',
};

it('applies defaults, normalizes blank values and ignores unrelated environment variables', () => {
  expect(
    environmentSchema.parse({
      ...validEnv,
      PORT: ' ',
      LLM_MODEL: ' ',
      PATH: '/bin',
    }),
  ).toEqual({
    ...validEnv,
    NODE_ENV: 'development',
    PORT: 3000,
    CLIENT_PORT: 3001,
    LLM_MODEL: 'gpt-6-luna',
    APP_URL: 'http://localhost:3001',
    AI_USER_DAILY_LIMIT: 20,
    AI_PLATFORM_DAILY_LIMIT: 200,
  });
});

it('parses configured ports and accepts deployment settings', () => {
  const config = environmentSchema.parse({
    ...validEnv,
    NODE_ENV: 'production',
    PORT: '3012',
    CLIENT_PORT: '4001',
    LLM_MODEL: 'custom-model',
    CLIENT_DIST_PATH: '/srv/client',
  });

  expect(config).toMatchObject({
    PORT: 3012,
    CLIENT_PORT: 4001,
    LLM_MODEL: 'custom-model',
    CLIENT_DIST_PATH: '/srv/client',
  });
  expect(
    environmentSchema.parse({
      ...validEnv,
      CORS_ORIGIN: ' https://a.example, https://b.example ,,',
    }).CORS_ORIGIN,
  ).toEqual(['https://a.example', 'https://b.example']);
  expect(environmentSchema.parse({ ...validEnv, CORS_ORIGIN: '  ' }).CORS_ORIGIN).toBeUndefined();
});

it('trims the required AI key', () => {
  expect(
    environmentSchema.parse({
      ...validEnv,
      OPENAI_API_KEY: ' test-key ',
    }).OPENAI_API_KEY,
  ).toBe('test-key');
});

it.each([undefined, '', ' '])(
  'requires OPENAI_API_KEY even when a legacy key is present (%s)',
  (value) => {
    expect(() =>
      environmentSchema.parse({
        ...validEnv,
        OPENAI_API_KEY: value,
        OPEN_API_SECRET_KEY: 'legacy-key',
      }),
    ).toThrow('OPENAI_API_KEY');
  },
);

it.each([
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_EXPIRATION_TIME',
  'JWT_REFRESH_EXPIRATION_TIME',
  'TELEGRAM_BOT_API_TOKEN',
  'OPENAI_API_KEY',
])('requires %s at startup', (name) => {
  expect(() => environmentSchema.parse({ ...validEnv, [name]: ' ' })).toThrow(name);
});

it.each([
  ['PORT', '0'],
  ['PORT', '65536'],
  ['PORT', '-1'],
  ['PORT', '3012.5'],
  ['PORT', 'abc'],
  ['CLIENT_PORT', 'abc'],
  ['NODE_ENV', 'unknown'],
  ['DATABASE_URL', 'https://localhost/db'],
  ['DATABASE_URL', 'not-a-url'],
  ['REDIS_URL', 'postgresql://localhost/test'],
  ['CORS_ORIGIN', 'not-a-url'],
  ['CORS_ORIGIN', 'ftp://localhost'],
  ['JWT_EXPIRATION_TIME', 'forever'],
  ['JWT_EXPIRATION_TIME', '0s'],
  ['JWT_EXPIRATION_TIME', ''],
  ['JWT_EXPIRATION_TIME', '500ms'],
  ['JWT_EXPIRATION_TIME', '1'.repeat(101)],
  ['JWT_REFRESH_EXPIRATION_TIME', '-1d'],
])('rejects invalid %s', (name, value) => {
  expect(() => environmentSchema.parse({ ...validEnv, [name]: value })).toThrow(name);
});

it('accepts supported URL schemes and ms duration formats', () => {
  expect(() =>
    environmentSchema.parse({
      ...validEnv,
      DATABASE_URL: 'postgres://localhost/db',
      REDIS_URL: 'rediss://localhost:6380',
      JWT_EXPIRATION_TIME: '2 hours',
    }),
  ).not.toThrow();
});

it('reports invalid fields without exposing their contents', () => {
  const secret = 'private-credential';

  try {
    environmentSchema.parse({ ...validEnv, DATABASE_URL: `bad://${secret}@host`, PORT: secret });

    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('DATABASE_URL');
    expect((error as Error).message).toContain('PORT');
    expect((error as Error).message).not.toContain(secret);
  }
});

it('provides validated values globally through the application ConfigModule', async () => {
  const original = process.env;

  process.env = { ...validEnv, PORT: '3012', LLM_MODEL: ' ' };

  let module: TestingModule | undefined;

  try {
    // The module reads environment variables at registration, as Nest ConfigModule.forRoot does.
    const { ConfigModule: ApplicationConfigModule } = await import('./config.module');

    module = await Test.createTestingModule({ imports: [ApplicationConfigModule] }).compile();

    const config = module.get<ConfigService<Environment, true>>(ConfigService);

    expect(config.get('PORT', { infer: true })).toBe(3012);
    expect(config.get('LLM_MODEL', { infer: true })).toBe('gpt-6-luna');
    process.env.PORT = 'invalid';
    expect(config.get('PORT', { infer: true })).toBe(3012);
    expect(module.get<ConfigService>(ConfigService).get('UNVALIDATED_KEY')).toBeUndefined();
  } finally {
    await module?.close();
    process.env = original;
  }
});

it('rejects invalid configuration before creating application services', async () => {
  const initialize = jest.fn();
  const configModule = ConfigModule.forRoot({
    ignoreEnvFile: true,
    validate: () => environmentSchema.parse({ ...validEnv, TELEGRAM_BOT_API_TOKEN: '' }),
  });

  await expect(
    Test.createTestingModule({
      imports: [configModule],
      providers: [{ provide: 'APPLICATION_SERVICE', useFactory: initialize }],
    }).compile(),
  ).rejects.toThrow('TELEGRAM_BOT_API_TOKEN');
  expect(initialize).not.toHaveBeenCalled();
});
