import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
};

/**
 * Normalizes every error to the docs/04 envelope:
 *   { "error": { "code", "message", "details?" } }
 * Services may throw HttpExceptions with a { code, message, details? }
 * payload to control the envelope precisely.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'ERROR';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string') message = b.message;
        else if (Array.isArray(b.message)) {
          message = 'Validation failed';
          details = b.message;
        }
        if (b.details !== undefined) details = b.details;
      }
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production' ? message : exception.message;
    }

    // NFR-6 — unexpected failures go to Sentry when configured.
    if (status >= 500 && process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }
}
