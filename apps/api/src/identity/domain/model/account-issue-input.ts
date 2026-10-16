/**
 * account-issue-input.ts — input fields the admin supplies when issuing a new account.
 */
import type { Role } from './role';

export interface AccountIssueInput {
  id: string;
  username: string;
  passwordHash: string;
  company: string;
  role: Role;
  createdAt: string;
  expiresAt?: string;
}
