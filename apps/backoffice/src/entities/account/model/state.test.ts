import { describe, expect, it } from 'vitest';
import {
  accountState,
  countByState,
  extendExpiry,
  filterAccounts,
  isPastExpiry,
  sortAccounts,
} from './state';
import type { Account } from './types';

const NOW = new Date('2026-10-21T12:00:00.000Z');

const account = (overrides: Partial<Account>): Account => ({
  id: 'acc-x',
  username: 'demo-viewer',
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  sessionCount: 0,
  ...overrides,
});

describe('accountState', () => {
  it('reads an expired active account as expired and otherwise the status', () => {
    expect(accountState(account({ status: 'active', expired: true }))).toBe('expired');
    expect(accountState(account({ status: 'active' }))).toBe('active');
    expect(accountState(account({ status: 'pending' }))).toBe('pending');
    expect(accountState(account({ status: 'revoked', expired: true }))).toBe('revoked');
    expect(accountState(account({ status: 'deleted' }))).toBe('deleted');
  });
});

describe('isPastExpiry', () => {
  it('is false without an expiry and true at or after it', () => {
    expect(isPastExpiry(undefined, NOW)).toBe(false);
    expect(isPastExpiry('2026-10-22T00:00:00.000Z', NOW)).toBe(false);
    expect(isPastExpiry('2026-10-21T12:00:00.000Z', NOW)).toBe(true);
    expect(isPastExpiry('2026-10-20T00:00:00.000Z', NOW)).toBe(true);
  });
});

describe('extendExpiry', () => {
  it('counts from now when there is no expiry or it already passed', () => {
    expect(extendExpiry(undefined, 30, NOW)).toBe('2026-11-20T12:00:00.000Z');
    expect(extendExpiry('2026-01-01T00:00:00.000Z', 30, NOW)).toBe('2026-11-20T12:00:00.000Z');
  });

  it('counts from the later expiry when it is still ahead', () => {
    expect(extendExpiry('2026-12-01T00:00:00.000Z', 90, NOW)).toBe('2027-03-01T00:00:00.000Z');
  });
});

describe('countByState', () => {
  it('counts the four shown states and skips deleted', () => {
    const counts = countByState([
      account({ status: 'pending' }),
      account({ status: 'pending' }),
      account({ status: 'active' }),
      account({ status: 'active', expired: true }),
      account({ status: 'revoked' }),
      account({ status: 'deleted' }),
    ]);
    expect(counts).toEqual({ pending: 2, active: 1, expired: 1, revoked: 1 });
  });
});

describe('sortAccounts', () => {
  it('puts pending first, then newest createdAt first', () => {
    const sorted = sortAccounts([
      account({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' }),
      account({ id: 'new', createdAt: '2026-10-10T00:00:00.000Z' }),
      account({ id: 'wait-old', status: 'pending', createdAt: '2026-08-01T00:00:00.000Z' }),
      account({ id: 'wait-new', status: 'pending', createdAt: '2026-10-15T00:00:00.000Z' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['wait-new', 'wait-old', 'new', 'old']);
  });

  it('does not change the given list', () => {
    const list = [account({ id: 'a' }), account({ id: 'b', status: 'pending' })];
    sortAccounts(list);
    expect(list.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('filterAccounts', () => {
  const list = [
    account({ id: '1', username: 'demo-viewer', company: '예시 동물병원' }),
    account({ id: '2', username: 'Sample-Clinic', company: '샘플 의원', status: 'pending' }),
    account({ id: '3', username: 'gone', company: '예시 의원', status: 'deleted' }),
    account({ id: '4', username: 'late', company: '예시 센터', expired: true }),
  ];

  it('filters by shown state', () => {
    expect(filterAccounts(list, 'all', '').map((a) => a.id)).toEqual(['1', '2', '3', '4']);
    expect(filterAccounts(list, 'expired', '').map((a) => a.id)).toEqual(['4']);
    expect(filterAccounts(list, 'deleted', '').map((a) => a.id)).toEqual(['3']);
  });

  it('matches username or company, any case, trimmed', () => {
    expect(filterAccounts(list, 'all', '  sample ').map((a) => a.id)).toEqual(['2']);
    expect(filterAccounts(list, 'all', '예시').map((a) => a.id)).toEqual(['1', '3', '4']);
    expect(filterAccounts(list, 'active', '예시').map((a) => a.id)).toEqual(['1']);
  });
});
