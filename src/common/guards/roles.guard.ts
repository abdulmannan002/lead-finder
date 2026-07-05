import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser } from './current-user.decorator';

const RANK: Record<UserRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || RANK[user.role] < RANK[required]) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Requires ${required} role in the active workspace`,
      });
    }
    return true;
  }
}
