/**
 * create-account.usecase.ts — admin issues an account (no public sign-up).
 * If the same username already exists, reports a conflict. Only the password hash is stored.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Account } from '@/identity/domain/model/account';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { PasswordHasher } from '@/identity/domain/port/password-hasher.port';
import { ACCOUNT_REPOSITORY, PASSWORD_HASHER } from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import type { CreateAccountCommand } from './create-account.command';
import { type AccountView, toAccountView } from './dto/account-view';

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(command: CreateAccountCommand): Promise<AccountView> {
    const existing = await this.accounts.findByUsername(command.username);
    if (existing) {
      throw new ConflictException(`Username already exists: ${command.username}`);
    }
    const account = Account.issue({
      id: randomUUID(),
      username: command.username,
      passwordHash: await this.hasher.hash(command.password),
      company: command.company,
      role: command.role ?? 'viewer',
      createdAt: this.time.now(),
      expiresAt: command.expiresAt,
    });
    await this.accounts.save(account);
    return toAccountView(account, this.time.nowMillis());
  }
}
