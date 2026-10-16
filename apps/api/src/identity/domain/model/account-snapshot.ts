/**
 * account-snapshot.ts — flat persistence representation of an account aggregate.
 */
import type { Locale } from '@/shared/locale';
import type { AccountStatus } from './account-status';
import type { Role } from './role';

export interface AccountSnapshot {
  id: string;
  username: string;
  passwordHash: string;
  company: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt?: string;
  expiresAt?: string;
  chatLanguage?: Locale;
}
