import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Prisma } from '@generated/prisma/client';

const extractFields = (meta: Record<string, unknown>): string | undefined => {
  if (Array.isArray(meta.target)) {
    return meta.target.join(', ');
  }
  if (typeof meta.target === 'string') {
    return meta.target;
  }

  const constraint = (
    meta.driverAdapterError as { cause?: { constraint?: { fields?: string[]; index?: string } } }
  )?.cause?.constraint;

  if (Array.isArray(constraint?.fields)) {
    return constraint.fields.join(', ');
  }

  return constraint?.index;
};

const toHttpException = (
  error: Prisma.PrismaClientKnownRequestError,
): HttpException | undefined => {
  const meta: Record<string, unknown> = error.meta ?? {};
  const model = typeof meta.modelName === 'string' ? meta.modelName : 'Record';
  const fields = extractFields(meta);

  switch (error.code) {
    case 'P2002':
      return new ConflictException(
        fields ? `${model} with this ${fields} already exists` : `${model} already exists`,
      );

    case 'P2025':
      return new NotFoundException(`${model} not found`);

    case 'P2003':
      return new BadRequestException('Related record does not exist');

    case 'P2014':
      return new BadRequestException('Operation would break a required relation');

    case 'P2000':
      return new BadRequestException(
        typeof meta.column_name === 'string'
          ? `Value for "${meta.column_name}" is too long`
          : 'Value is too long',
      );

    case 'P2011':
      return new BadRequestException('A required field is missing');

    default:
      return undefined;
  }
};

const MAX_DETAIL_LENGTH = 200;

const truncate = (text: string) =>
  text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}…` : text;

const describe = (exception: unknown): string => {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: Record<string, unknown> = exception.meta ?? {};
    const model = typeof meta.modelName === 'string' ? ` on ${meta.modelName}` : '';
    const fields = extractFields(meta);
    const cause = (meta.driverAdapterError as { cause?: { originalMessage?: string } })?.cause;

    const lines = exception.message.split('\n').filter((line) => line.trim().length > 0);
    const detail = cause?.originalMessage ?? lines.at(-1) ?? exception.code;

    return `Prisma ${exception.code}${model}${fields ? ` (${fields})` : ''}: ${truncate(detail)}`;
  }

  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? exception.message);

    return `${exception.name}: ${Array.isArray(message) ? message.join('; ') : message}`;
  }

  if (exception instanceof Error) {
    return `${exception.name}: ${exception.message}`;
  }

  return `UnknownException: ${String(exception)}`;
};

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const error_ =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? (toHttpException(exception) ?? exception)
        : exception;

    const status =
      error_ instanceof HttpException ? error_.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = error_ instanceof HttpException ? error_.getResponse() : null;
    const exceptionName = error_ instanceof Error ? error_.name : 'UnknownException';

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      error = exceptionName;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseBody = exceptionResponse as {
        message?: string | string[];
        error?: string;
      };

      message = responseBody.message ?? message;
      error = responseBody.error ?? exceptionName;
    }

    this.log(status, `${request.method} ${request.originalUrl}`, exception);

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private log(status: number, route: string, exception: unknown): void {
    const line = `${route} ${status} — ${describe(exception)}`;

    if (status >= 500) {
      this.logger.error(line, exception instanceof Error ? exception.stack : undefined);
      return;
    }

    this.logger.warn(line);
  }
}
