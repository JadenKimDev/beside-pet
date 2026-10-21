import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import {
  formatExpiry,
  relativeTime,
  stateFilterOptions,
  summaryCards,
  visibleAccounts,
} from './view';

const account = (over: Partial<Account> & Pick<Account, 'id'>): Account => ({
  username: `demo-${over.id}`,
  company: '예시 동물병원',
  role: 'viewer',
  status: 'active',
  expired: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  sessionCount: 0,
  ...over,
});

const rows: Account[] = [
  account({ id: 'a', createdAt: '2026-10-03T00:00:00.000Z' }),
  account({ id: 'b', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' }),
  account({ id: 'c', expired: true, createdAt: '2026-10-05T00:00:00.000Z', company: '예시 의원' }),
  account({ id: 'd', status: 'revoked', createdAt: '2026-10-02T00:00:00.000Z' }),
  account({ id: 'e', status: 'deleted', createdAt: '2026-10-06T00:00:00.000Z' }),
];

describe('visibleAccounts', () => {
  it('puts pending first then newest first', () => {
    expect(visibleAccounts(rows, 'all', '').map((row) => row.id)).toEqual([
      'b',
      'e',
      'c',
      'a',
      'd',
    ]);
  });

  it('filters by visible state and search, keeping the order', () => {
    expect(visibleAccounts(rows, 'expired', '').map((row) => row.id)).toEqual(['c']);
    expect(visibleAccounts(rows, 'all', '의원').map((row) => row.id)).toEqual(['c']);
    expect(visibleAccounts(rows, 'active', 'DEMO-A').map((row) => row.id)).toEqual(['a']);
  });
});

describe('summaryCards', () => {
  it('counts four states without deleted', () => {
    expect(summaryCards(rows)).toEqual([
      { state: 'pending', label: '승인 대기', count: 1 },
      { state: 'active', label: '활성', count: 1 },
      { state: 'expired', label: '만료됨', count: 1 },
      { state: 'revoked', label: '정지됨', count: 1 },
    ]);
  });
});

describe('stateFilterOptions', () => {
  it('offers all and the five states', () => {
    expect(stateFilterOptions().map((option) => option.value)).toEqual([
      'all',
      'pending',
      'active',
      'expired',
      'revoked',
      'deleted',
    ]);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');

  it('says minutes, hours and days ago', () => {
    expect(relativeTime('2026-10-21T11:59:30.000Z', now)).toBe('방금 전');
    expect(relativeTime('2026-10-21T11:15:00.000Z', now)).toBe('45분 전');
    expect(relativeTime('2026-10-21T07:00:00.000Z', now)).toBe('5시간 전');
    expect(relativeTime('2026-10-18T12:00:00.000Z', now)).toBe('3일 전');
  });

  it('shows a dash without a time', () => {
    expect(relativeTime(undefined, now)).toBe('—');
  });
});

describe('formatExpiry', () => {
  it('formats a local date and time and says no limit without one', () => {
    const local = new Date(2026, 11, 31, 23, 59).toISOString();
    expect(formatExpiry(local)).toBe('2026-12-31 23:59');
    expect(formatExpiry(undefined)).toBe('기한 없음');
  });
});
