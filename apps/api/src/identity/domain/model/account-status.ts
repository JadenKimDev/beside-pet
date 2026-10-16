/**
 * account-status.ts — account status. The guard re-checks this on every request so revoked/deleted
 * accounts are blocked immediately. A self-registered account starts as `pending` and cannot sign
 * in until an admin approves it (→ active).
 */
export type AccountStatus = 'pending' | 'active' | 'revoked' | 'deleted';

export const isActive = (status: AccountStatus): boolean => status === 'active';

export const isPending = (status: AccountStatus): boolean => status === 'pending';
