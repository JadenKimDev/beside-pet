/**
 * features/admin/admin.view.ts — what the admin screen derives from the account list.
 * The counts and filters are computed here from the list the server returns; the
 * server keeps no counts (nothing derived is stored).
 */
import type { Account } from './admin.types';

/** One shown state per account. An active account past its expiry reads as expired. */
export type AccountState = 'pending' | 'active' | 'expired' | 'revoked' | 'deleted';

/** The four counted states, in the order the summary shows them. */
export const COUNTED_STATES = ['pending', 'active', 'expired', 'revoked'] as const;
export type CountedState = (typeof COUNTED_STATES)[number];

export type AccountFilter = 'all' | CountedState;

export const accountState = (account: Account): AccountState => {
  if (account.status === 'active') return account.expired ? 'expired' : 'active';
  return account.status;
};

export const countByState = (accounts: readonly Account[]): Record<CountedState, number> => {
  const counts: Record<CountedState, number> = { pending: 0, active: 0, expired: 0, revoked: 0 };
  for (const account of accounts) {
    const state = accountState(account);
    if (state !== 'deleted') counts[state] += 1;
  }
  return counts;
};

/** Pending applications float to the top so they get acted on. */
const byPendingFirst = (a: Account, b: Account): number =>
  Number(b.status === 'pending') - Number(a.status === 'pending');

/** Accounts matching the status filter and the search text (username or company, any case). */
export const visibleAccounts = (
  accounts: readonly Account[],
  filter: AccountFilter,
  query: string,
): Account[] => {
  const needle = query.trim().toLowerCase();
  return accounts
    .filter((account) => filter === 'all' || accountState(account) === filter)
    .filter(
      (account) =>
        !needle ||
        account.username.toLowerCase().includes(needle) ||
        account.company.toLowerCase().includes(needle),
    )
    .sort(byPendingFirst);
};
