import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'minRole';
/** Requires the caller's role in the ACTIVE tenant to be at least `role`. */
export const Roles = (role: UserRole) => SetMetadata(ROLES_KEY, role);
