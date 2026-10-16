/**
 * delete-account.usecase.ts — admin permanently deletes an account (hard). Since the guard re-checks
 * account existence on every request, it is blocked immediately after deletion. To only block access while preserving data, use revoke.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';

@Injectable()
export class DeleteAccountUseCase {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  async execute(accountId: string): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account not found: ${accountId}`);
    }
    await this.accounts.delete(accountId);
  }
}
