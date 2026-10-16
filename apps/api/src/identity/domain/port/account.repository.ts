/**
 * account.repository.ts — account persistence port (out). In-memory first → Postgres later.
 */
import type { Account } from '../model/account';

export interface AccountRepository {
  save(account: Account): Promise<void>;
  findById(id: string): Promise<Account | undefined>;
  findByUsername(username: string): Promise<Account | undefined>;
  list(): Promise<Account[]>;
  delete(id: string): Promise<void>;
}
