/**
 * register-account.usecase.ts — public account application (sign-up request).
 * Creates a pending viewer account that cannot sign in until an admin approves
 * it. Only the password hash is stored.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Account } from '@/identity/domain/model/account';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { PasswordHasher } from '@/identity/domain/port/password-hasher.port';
import { ACCOUNT_REPOSITORY, PASSWORD_HASHER } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';
import type { RegisterAccountCommand } from './register-account.command';

@Injectable()
export class RegisterAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(command: RegisterAccountCommand): Promise<AccountView> {
    const existing = await this.accounts.findByUsername(command.username);
    if (existing) {
      throw new ConflictException(`Username already exists: ${command.username}`);
    }
    const account = Account.applyFor({
      id: randomUUID(),
      username: command.username,
      passwordHash: await this.hasher.hash(command.password),
      company: command.company,
      createdAt: this.time.now(),
    });
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
