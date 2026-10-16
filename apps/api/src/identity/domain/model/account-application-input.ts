/**
 * account-application-input.ts — input fields a visitor supplies when applying
 * for an account (public sign-up request). Always a viewer; no expiry — an
 * admin can set one after approval.
 */
export interface AccountApplicationInput {
  id: string;
  username: string;
  passwordHash: string;
  company: string;
  createdAt: string;
}
