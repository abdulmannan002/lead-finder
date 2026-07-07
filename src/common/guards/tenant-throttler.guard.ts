import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * NFR-2 / docs/03 §6 — rate limits: 100/min per TENANT for the API
 * (authenticated requests track by tenantId, so a tenant cannot dodge
 * the limit by adding users), per-IP for public routes; auth endpoints
 * carry a stricter 5/min via @Throttle. In-memory storage — fine for the
 * v1 single-instance API (swap to the Redis storage when scaling out).
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    // The e2e suite hammers endpoints by design; a spec opts back in
    // with THROTTLE_IN_TEST=1 to test the limiter itself.
    return process.env.NODE_ENV === 'test' && !process.env.THROTTLE_IN_TEST;
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.tenantId ?? req.ip ?? 'anonymous';
  }
}
