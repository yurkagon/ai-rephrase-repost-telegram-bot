import 'reflect-metadata';

jest.mock('@/app.module', () => ({ AppModule: class {} }));
jest.mock('@/bootstrap/swagger', () => ({ useSwagger: jest.fn() }));

it.each(['missing-schema', 'unexpected-error'])(
  'reports %s safely and exits with a failure status',
  async (scenario) => {
    const previousExitCode = process.exitCode;
    const secret = 'private-token-in-provider-url';

    try {
      await jest.isolateModulesAsync(async () => {
        const { NestFactory } = await import('@nestjs/core');
        const { Logger } = await import('@nestjs/common');
        const { Prisma } = await import('@generated/prisma/client');
        const failure =
          scenario === 'missing-schema'
            ? new Prisma.PrismaClientKnownRequestError(secret, {
                code: 'P2021',
                clientVersion: 'test',
              })
            : new TypeError(secret);
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        const kill = jest.spyOn(process, 'kill').mockReturnValue(true);

        jest.spyOn(NestFactory, 'create').mockRejectedValue(failure);
        await import('./main');
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(log).toHaveBeenCalledWith(
          scenario === 'missing-schema'
            ? {
                event: 'Application failed to start',
                error: 'PrismaClientKnownRequestError',
                code: 'P2021',
                hint: 'Database schema is missing or outdated. Run pnpm db:deploy.',
              }
            : {
                event: 'Application failed to start',
                error: 'TypeError',
                hint: 'Check configuration and connections.',
              },
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
        expect(process.exitCode).toBe(1);
        expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
      });
    } finally {
      jest.restoreAllMocks();
      process.exitCode = previousExitCode;
    }
  },
);
