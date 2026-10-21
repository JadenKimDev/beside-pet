import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import { accountActions, canPurge, MODERATION_LABELS, needsConfirm } from './actions';

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
  it('needs a soft-deleted account and the exact username typed', () => {
    const deleted = account({ status: 'deleted' });
    expect(canPurge(deleted, 'demo-viewer')).toBe(true);
    expect(canPurge(deleted, 'demo-viewe')).toBe(false);
    expect(canPurge(deleted, ' demo-viewer')).toBe(false);
    expect(canPurge(account({ status: 'revoked' }), 'demo-viewer')).toBe(false);
  });
});
