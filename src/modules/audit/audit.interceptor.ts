import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, from } from 'rxjs';
import { catchError, mergeMap, map } from 'rxjs/operators';
import { AuthUser } from '../../common/guards/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Body fields that must never reach the activity log (rule 3). */
const SECRET_FIELDS = new Set([
  'key',
  'pass',
  'password',
  'bottoken',
  'refreshtoken',
  'accesstoken',
  'token',
  'secret',
  'credentials',
]);
const MAX_PAYLOAD_CHARS = 2_000;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.length > 20 ? `[array:${value.length}]` : value.map((v) => redact(v, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_FIELDS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1),
    ]),
  );
}

/**
 * FR-10.1 — who changed what: every authenticated mutating request gets
 * an activity-log row after it succeeds. Secrets are redacted before
 * anything is stored; log failures never fail the request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!MUTATING.has(req.method) || !user) return next.handle();

    // 'PATCH /api/v1/campaigns/:id' — the route pattern, not raw ids.
    const route = req.route?.path ?? req.url;
    const action = `${req.method} ${route}`;

    let payload: Record<string, unknown> = {
      params: req.params ?? {},
      body: redact(req.body ?? {}),
    };
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
      payload = { params: req.params ?? {}, body: '[TRUNCATED]' };
    }

    return next.handle().pipe(
      mergeMap((responseData) =>
        from(
          this.prisma.client.activityLog.create({
            data: {
              action,
              userId: user.userId,
              payload: payload as Prisma.InputJsonValue,
            } satisfies TenantCreateData<Prisma.ActivityLogUncheckedCreateInput> as unknown as Prisma.ActivityLogUncheckedCreateInput,
          }),
        ).pipe(
          map(() => responseData),
          catchError((err) => {
            this.logger.warn(`audit write failed for ${action}: ${err.message}`);
            return from([responseData]);
          }),
        ),
      ),
    );
  }
}
