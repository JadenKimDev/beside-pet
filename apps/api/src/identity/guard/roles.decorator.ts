/**
 * roles.decorator.ts — marks the roles required for a handler. Read by RolesGuard.
 */
import { SetMetadata } from '@nestjs/common';
import type { Role } from '@/identity/domain/model/role';

export const ROLES_KEY = 'required-roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
