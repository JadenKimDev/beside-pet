/**
 * admin-setup.ts — first-run admin bootstrap (SetupTokenGate adapter).
 * When no admin account exists at boot, generates a one-time setup token and
 * prints it to the server log. The operator exchanges it for the first admin
 * account via POST /v1/auth/setup — no credentials live in env files or code.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { isAdmin } from '@/identity/domain/model/role';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import type { SetupTokenGate } from '@/identity/domain/port/setup-token.port';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';

@Injectable()
export class AdminSetup implements OnModuleInit, SetupTokenGate {
  private readonly logger = new Logger(AdminSetup.name);
  private token?: string;

  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  async onModuleInit(): Promise<void> {
    const accounts = await this.accounts.list();
    if (accounts.some((account) => isAdmin(account.role))) {
      return;
    }
    this.token = randomBytes(16).toString('hex');
    this.logger.log(`no admin account yet — one-time setup token: ${this.token}`);
    this.logger.log('exchange it for the first admin account: POST /v1/auth/setup');
  }

  isPending(): boolean {
    return this.token !== undefined;
  }

  redeem(candidate: string): boolean {
    if (this.token === undefined) {
      return false;
    }
    const expected = Buffer.from(this.token);
    const given = Buffer.from(candidate);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return false;
    }
    this.token = undefined;
    return true;
  }
}
