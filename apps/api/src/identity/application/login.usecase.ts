/**
 * login.usecase.ts — username + password login → JWT issuance.
 * Revoked, deleted, and expired accounts are rejected. Returns the token; the controller sets the cookie.
 */
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { isActive, isPending } from '@/identity/domain/model/account-status';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { PasswordHasher } from '@/identity/domain/port/password-hasher.port';
import type { TokenSigner } from '@/identity/domain/port/token-signer.port';
import { ACCOUNT_REPOSITORY, PASSWORD_HASHER, TOKEN_SIGNER } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { toAccountView } from './dto/account-view';
import type { LoginCommand } from './login-command';
import type { LoginResult } from './login-result';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const account = await this.accounts.findByUsername(command.username);
    const ok = account && (await this.hasher.verify(command.password, account.passwordHash));
    // Reject with the same message so we don't reveal whether the username exists.
    if (!account || !ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (isPending(account.status)) {
      throw new ForbiddenException('Your account is awaiting approval.');
    }
    if (account.status === 'revoked') {
      throw new UnauthorizedException('Account is revoked');
    }
    if (!isActive(account.status)) {
      throw new UnauthorizedException('Account is unavailable');
    }
    if (account.isExpired(this.time.nowMillis())) {
      throw new UnauthorizedException('Account has expired');
    }
    account.recordLogin(this.time.now());
    await this.accounts.save(account);
    const token = this.signer.sign({ sub: account.id, role: account.role });
    return { token, account: toAccountView(account, this.time.nowMillis()) };
  }
}
