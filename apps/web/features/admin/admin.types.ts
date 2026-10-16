/**
 * features/admin/admin.types.ts — admin console types, mirroring the backend AccountView.
 * The admin console talks to the backend admin surface.
 * Identity types (Role, Principal) live in features/auth.
 */
import type { Role } from '@/features/auth/auth.types';

export type AccountStatus = 'pending' | 'active' | 'revoked' | 'deleted';

export interface Account {
  id: string;
  username: string;
  company: string;
  role: Role;
  status: AccountStatus;
  expiresAt?: string; // absolute UTC instant (ISO-8601)
  expired: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface CreateAccountInput {
  username: string;
  password: string;
  company: string;
  expiresAt?: string; // UTC instant, or undefined for no expiry
}
