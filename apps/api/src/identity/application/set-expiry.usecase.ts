/**
 * set-expiry.usecase.ts — admin sets, extends, or clears an account's absolute UTC expiry instant.
 * Passing undefined clears the expiry. The guard enforces expiry on every request.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';

@Injectable()
export class SetExpiryUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(accountId: string, expiresAt?: string): Promise<AccountView> {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account not found: ${accountId}`);
    }
    account.setExpiry(expiresAt);
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
