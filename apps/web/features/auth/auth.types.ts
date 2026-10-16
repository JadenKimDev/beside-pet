/**
 * features/auth/auth.types.ts — identity types shared across the app.
 * Auth owns Role and Principal; other features (e.g. admin) import Role from here.
 */
import type { Locale } from '@/i18n/config';

export type Role = 'admin' | 'viewer';

/** Minimal identity returned by /v1/auth/me. */
export interface Principal {
  id: string;
  username: string;
  company: string;
  role: Role;
  /** Conversation language setting (independent of the UI locale). */
  chatLanguage?: Locale;
}
