// 목록에서 화면이 구하는 값. 서버는 집계를 저장하지 않으므로 받은 목록에서 계산한다.
import type { Account, AccountRecord } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 보이는 상태. 활성인데 만료가 지났으면 만료됨이다. */
export type AccountState = 'pending' | 'active' | 'expired' | 'revoked' | 'deleted';

/** 집계 줄이 세는 네 상태(삭제됨은 세지 않는다). */
export const COUNTED_STATES = ['pending', 'active', 'expired', 'revoked'] as const;
export type CountedState = (typeof COUNTED_STATES)[number];

export type AccountFilter = 'all' | AccountState;

export function accountState(account: Pick<AccountRecord, 'status' | 'expired'>): AccountState {
  if (account.status === 'active' && account.expired) return 'expired';
  return account.status;
}

/** 만료 시각이 `now` 이전이거나 같은가. 만료가 없으면 지나지 않았다. */
export function isPastExpiry(expiresAt: string | undefined, now: Date = new Date()): boolean {
  return expiresAt !== undefined && new Date(expiresAt).getTime() <= now.getTime();
}

/** 만료를 `days` 일 뒤로. 지금과 지금 만료일 중 늦은 쪽에서 센다. ISO 로 돌려준다. */
export function extendExpiry(
  expiresAt: string | undefined,
  days: number,
  now: Date = new Date(),
): string {
  const current = expiresAt === undefined ? 0 : new Date(expiresAt).getTime();
  const base = Math.max(now.getTime(), current);
  return new Date(base + days * DAY_MS).toISOString();
}

export function countByState(accounts: readonly Account[]): Record<CountedState, number> {
  const counts: Record<CountedState, number> = { pending: 0, active: 0, expired: 0, revoked: 0 };
  for (const account of accounts) {
    const state = accountState(account);
    if (state !== 'deleted') counts[state] += 1;
  }
  return counts;
}

/** 승인 대기가 위, 그다음 `createdAt` 내림차순. 받은 목록은 바꾸지 않는다. */
export function sortAccounts<Row extends AccountRecord>(accounts: readonly Row[]): Row[] {
  return [...accounts].sort(
    (a, b) =>
      Number(b.status === 'pending') - Number(a.status === 'pending') ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

/** 보이는 상태와 찾는 글(아이디나 소속, 대소문자 무시)로 거른다. 차례는 그대로 둔다. */
export function filterAccounts<Row extends AccountRecord>(
  accounts: readonly Row[],
  filter: AccountFilter,
  query: string,
): Row[] {
  const needle = query.trim().toLowerCase();
  return accounts.filter(
    (account) =>
      (filter === 'all' || accountState(account) === filter) &&
      (!needle ||
        account.username.toLowerCase().includes(needle) ||
        account.company.toLowerCase().includes(needle)),
  );
}
