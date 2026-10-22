import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import {
  accountActions,
  canPurge,
  MODERATION_LABELS,
  needsConfirm,
  purgeAvailability,
  suspendedAtText,
} from './actions';
import { PURGE_TEXT } from './texts';

const NOW = new Date('2027-01-01T00:00:00.000Z');
const LONG_AGO = '2026-09-01T00:00:00.000Z';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-7',
    username: 'demo-viewer',
    company: '예시 동물병원',
    role: 'viewer',
    status: 'active',
    expired: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    sessionCount: 2,
    ...overrides,
  };
}

describe('accountActions', () => {
  it('follows the shown state', () => {
    expect(accountActions(account({ status: 'pending' }))).toEqual(['approve', 'softDelete']);
    expect(accountActions(account({ status: 'active' }))).toEqual([
      'setExpiry',
      'revoke',
      'softDelete',
    ]);
    expect(accountActions(account({ status: 'active', expired: true }))).toEqual([
      'extendExpiry',
      'revoke',
      'softDelete',
    ]);
    expect(accountActions(account({ status: 'revoked' }))).toEqual(['reactivate', 'softDelete']);
    expect(accountActions(account({ status: 'deleted' }))).toEqual(['restore', 'purge']);
  });

  it('gives no actions on admin rows', () => {
    expect(accountActions(account({ role: 'admin' }))).toEqual([]);
  });

  it('labels every action', () => {
    expect(MODERATION_LABELS).toEqual({
      approve: '승인',
      setExpiry: '만료 설정',
      extendExpiry: '만료 연장',
      revoke: '정지',
      reactivate: '재개',
      restore: '복구',
      softDelete: '삭제',
      purge: '완전 삭제',
    });
  });

  it('asks before revoke, soft delete and purge only', () => {
    expect(needsConfirm('revoke')).toBe(true);
    expect(needsConfirm('softDelete')).toBe(true);
    expect(needsConfirm('purge')).toBe(true);
    expect(needsConfirm('approve')).toBe(false);
    expect(needsConfirm('restore')).toBe(false);
    expect(needsConfirm('setExpiry')).toBe(false);
  });
});

describe('canPurge', () => {
  it('needs a soft-deleted account past retention and the exact username typed', () => {
    const deleted = account({ status: 'deleted', deletedAt: LONG_AGO });
    expect(canPurge(deleted, 'demo-viewer', NOW)).toBe(true);
    expect(canPurge(deleted, 'demo-viewe', NOW)).toBe(false);
    expect(canPurge(deleted, ' demo-viewer', NOW)).toBe(false);
    expect(canPurge(account({ status: 'revoked', deletedAt: LONG_AGO }), 'demo-viewer', NOW)).toBe(
      false,
    );
    expect(
      canPurge(
        account({ status: 'deleted', deletedAt: '2026-12-01T00:00:00.000Z' }),
        'demo-viewer',
        NOW,
      ),
    ).toBe(false);
  });
});

describe('purgeAvailability', () => {
  it('allows purge three months after the suspension', () => {
    expect(purgeAvailability(account({ status: 'deleted', deletedAt: LONG_AGO }), NOW)).toEqual({
      allowed: true,
    });
  });

  it('blocks purge before that and says how many days are left', () => {
    // 2026-12-01 + 3개월 = 2027-03-01, 2027-01-01 에서 59일
    expect(
      purgeAvailability(account({ status: 'deleted', deletedAt: '2026-12-01T00:00:00.000Z' }), NOW),
    ).toEqual({ allowed: false, reason: PURGE_TEXT.daysLeft(59) });
    expect(PURGE_TEXT.daysLeft(59)).toContain('59');
  });

  it('blocks purge when the suspension time is unknown', () => {
    expect(purgeAvailability(account({ status: 'deleted' }), NOW)).toEqual({
      allowed: false,
      reason: PURGE_TEXT.noSuspendedAt,
    });
  });
});

describe('suspendedAtText', () => {
  it('shows the suspension time in local time for a soft-deleted account only', () => {
    const at = new Date(2026, 9, 22, 9, 5);
    expect(suspendedAtText(account({ status: 'deleted', deletedAt: at.toISOString() }))).toBe(
      PURGE_TEXT.suspendedAt('2026-10-22 09:05'),
    );
    expect(suspendedAtText(account({ status: 'deleted' }))).toBeUndefined();
    expect(suspendedAtText(account({ status: 'active' }))).toBeUndefined();
  });
});
