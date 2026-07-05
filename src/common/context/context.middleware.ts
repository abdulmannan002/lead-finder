import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithContext } from './request-context';

/** Opens an empty AsyncLocalStorage scope for every request. */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    runWithContext({}, () => next());
  }
}
