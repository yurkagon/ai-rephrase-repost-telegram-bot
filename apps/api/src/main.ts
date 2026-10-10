import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

import { AppModule } from '@/app.module';
import type { Environment } from '@/config/env.schema';
import { API_PREFIX } from '@/config/openapi';
import { useClientApp } from '@/bootstrap/client-app';
import { useSwagger } from '@/bootstrap/swagger';
import { ExceptionsFilter } from '@/common/filters/exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  const port = config.getOrThrow('PORT', { infer: true });

  app.enableShutdownHooks();
  app.use(helmet());

  if (config.get('NODE_ENV', { infer: true }) === 'production') app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ExceptionsFilter());

  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }) ?? [
      `http://localhost:${port}`,
      `http://localhost:${config.getOrThrow('CLIENT_PORT', { infer: true })}`,
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  app.setGlobalPrefix(API_PREFIX);

  useSwagger(app);

  useClientApp(app, config.get('CLIENT_DIST_PATH', { infer: true }));

  await app.listen(port);

  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`);
}

void bootstrap().catch(() => {
  new Logger('Bootstrap').error(
    'Application failed to start; check configuration and connections.',
  );
  process.exitCode = 1;
  process.kill(process.pid, 'SIGTERM');
});
