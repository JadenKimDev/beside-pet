/**
 * revoke-account.usecase.ts — admin revokes an account. Since the guard re-checks status on every request, it is blocked immediately.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';

@Injectable()
export class RevokeAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(accountId: string): Promise<AccountView> {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account not found: ${accountId}`);
    }
    account.revoke();
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
