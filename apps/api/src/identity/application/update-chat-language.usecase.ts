/**
 * update-chat-language.usecase.ts — the signed-in user sets their conversation
 * language. Independent of the app UI language; active sessions adopt it on
 * their next turn.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';
import type { UpdateChatLanguageCommand } from './update-chat-language.command';

@Injectable()
export class UpdateChatLanguageUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(command: UpdateChatLanguageCommand): Promise<AccountView> {
    const account = await this.accounts.findById(command.accountId);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    account.setChatLanguage(command.chatLanguage);
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
