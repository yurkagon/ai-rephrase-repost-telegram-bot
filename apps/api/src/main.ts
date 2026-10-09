import '@/config/load-env';

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '@/app.module';
import { getCorsOrigins, getPort } from '@/config';
import { API_PREFIX } from '@/config/openapi';
import { useClientApp } from '@/bootstrap/client-app';
import { useSwagger } from '@/bootstrap/swagger';
import { ExceptionsFilter } from '@/common/filters/exceptions.filter';

async function bootstrap() {
  const port = getPort();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // Query params arrive as strings; `@Type(() => Number)` only applies when
      // the pipe is allowed to hand back the transformed instance.
      transform: true,
    }),
  );
  app.useGlobalFilters(new ExceptionsFilter());

  app.enableCors({
    origin: getCorsOrigins(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  app.setGlobalPrefix(API_PREFIX);

  useSwagger(app);

  // Serves the client build when one exists; in dev that is Vite's job.
  useClientApp(app);

  await app.listen(port);

  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`);
}
void bootstrap();
