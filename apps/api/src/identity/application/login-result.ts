/**
 * login-result.ts — output of the login use case: the issued token and the outward account view.
 */
import type { AccountView } from './dto/account-view';

export interface LoginResult {
  token: string;
  account: AccountView;
}
