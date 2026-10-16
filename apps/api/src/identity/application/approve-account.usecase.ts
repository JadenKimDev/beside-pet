/**
 * approve-account.usecase.ts — admin approves a pending application (→ active).
 * Distinct from reactivation (revoked → active): only a pending account can be
 * approved, so the transition stays auditable.
 */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isPending } from '@/identity/domain/model/account-status';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';

@Injectable()
export class ApproveAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(id: string): Promise<AccountView> {
    const account = await this.accounts.findById(id);
    if (!account) {
      throw new NotFoundException(`Account not found: ${id}`);
    }
    if (!isPending(account.status)) {
      throw new ConflictException('Only a pending account can be approved.');
    }
    account.approve();
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
