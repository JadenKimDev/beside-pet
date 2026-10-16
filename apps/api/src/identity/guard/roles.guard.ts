/**
 * roles.guard.ts — enforces the roles marked with @Roles. Runs after JwtAuthGuard (identity first).
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@/identity/domain/model/role';
import type { AuthenticatedAccount } from './authenticated-account';
import { ROLES_KEY } from './roles.decorator';

interface RequestWithAuth {
  account?: AuthenticatedAccount;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const role = request.account?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
