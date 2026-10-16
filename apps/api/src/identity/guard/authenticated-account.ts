/**
 * authenticated-account.ts — the identity principal the guard attaches to the request after verification.
 * Controllers receive it via @CurrentAccount() (derived from the token, not the request body).
 */
import type { Role } from '../domain/model/role';

export interface AuthenticatedAccount {
  id: string;
  username: string;
  company: string;
  role: Role;
}
