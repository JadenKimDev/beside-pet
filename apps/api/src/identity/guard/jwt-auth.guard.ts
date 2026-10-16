/**
 * jwt-auth.guard.ts — verifies the JWT from the httpOnly cookie and attaches the identity to the request.
 * So a revocation takes effect immediately, it does not trust the token alone but re-checks account status from the repository on every request.
 */
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isActive } from '@/identity/domain/model/account-status';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { TokenSigner } from '@/identity/domain/port/token-signer.port';
import { ACCOUNT_REPOSITORY, TOKEN_SIGNER } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import type { AuthenticatedAccount } from './authenticated-account';
import { AUTH_COOKIE } from './cookie';

interface RequestWithAuth {
  cookies?: Record<string, string | undefined>;
  account?: AuthenticatedAccount;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = request.cookies?.[AUTH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }
    const claims = this.signer.verify(token);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const account = await this.accounts.findById(claims.sub);
    // Re-check on every request so revoked, deleted, and expired accounts are blocked immediately.
    if (!account || !isActive(account.status) || account.isExpired(this.time.nowMillis())) {
      throw new UnauthorizedException('Account is unavailable');
    }
    request.account = {
      id: account.id,
      username: account.username,
      company: account.company,
      role: account.role,
    };
    return true;
  }
}
