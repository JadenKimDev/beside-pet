/**
 * account.response.ts — wire shape of an account (mirrors AccountView).
 * A class (not an interface) so the OpenAPI plugin can emit its schema.
 */
import type { AccountStatus } from '@/identity/domain/model/account-status';
import type { Role } from '@/identity/domain/model/role';
import type { Locale } from '@/shared/locale';

export class AccountResponse {
  id!: string;
  username!: string;
  company!: string;
  role!: Role;
  status!: AccountStatus;
  /** Absolute UTC expiry instant, when set. */
  expiresAt?: string;
  expired!: boolean;
  createdAt!: string;
  lastLoginAt?: string;
  /** Conversation language preference (independent of the app UI language). */
  chatLanguage?: Locale;
}
