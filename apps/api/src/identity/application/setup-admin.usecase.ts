/**
 * setup-admin.usecase.ts — exchanges the one-time boot token for the first
 * admin account. The operator picks the credentials at first run, so nothing
 * secret is stored in env files. One shot: redeeming the token closes the gate.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Account } from '@/identity/domain/model/account';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { PasswordHasher } from '@/identity/domain/port/password-hasher.port';
import type { SetupTokenGate } from '@/identity/domain/port/setup-token.port';
import {
  ACCOUNT_REPOSITORY,
  PASSWORD_HASHER,
  SETUP_TOKEN_GATE,
} from '@/identity/domain/port/tokens';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { type AccountView, toAccountView } from './dto/account-view';
import type { SetupAdminCommand } from './setup-admin.command';

@Injectable()
export class SetupAdminUseCase {
  constructor(
    @Inject(SETUP_TOKEN_GATE) private readonly gate: SetupTokenGate,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {}

  async execute(command: SetupAdminCommand): Promise<AccountView> {
    if (!this.gate.isPending()) {
      throw new ConflictException('Setup is already complete');
    }
    if (!this.gate.redeem(command.token)) {
      throw new ForbiddenException('Invalid setup token');
    }
    const admin = Account.issue({
      id: randomUUID(),
      username: command.username,
      passwordHash: await this.hasher.hash(command.password),
      company: command.company ?? 'Beside Pet',
      role: 'admin',
      createdAt: this.time.now(),
    });
    await this.accounts.save(admin);
    return toAccountView(admin, this.time.nowMillis());
  }
}
