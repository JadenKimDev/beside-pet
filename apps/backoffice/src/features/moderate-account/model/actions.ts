// 계정 행의 동작(화면 안 8절 "행 동작"). 보이는 상태가 버튼을 정하고, 관리자 행에는 동작을 두지 않는다(스스로 잠그는 사고를 막는다).
import { type Account, type AccountState, accountState } from '@/entities/account';

export type ModerationAction =
  | 'approve'
  | 'setExpiry'
  | 'extendExpiry'
  | 'revoke'
  | 'reactivate'
  | 'restore'
  | 'softDelete'
  | 'purge';

const BY_STATE: Record<AccountState, readonly ModerationAction[]> = {
  pending: ['approve', 'softDelete'],
  active: ['setExpiry', 'revoke', 'softDelete'],
  expired: ['extendExpiry', 'revoke', 'softDelete'],
  revoked: ['reactivate', 'softDelete'],
  deleted: ['restore', 'purge'],
};

export const MODERATION_LABELS: Record<ModerationAction, string> = {
  approve: '승인',
  setExpiry: '만료 설정',
  extendExpiry: '만료 연장',
  revoke: '정지',
  reactivate: '재개',
  restore: '복구',
  softDelete: '삭제',
  purge: '완전 삭제',
};

export function accountActions(account: Account): ModerationAction[] {
  if (account.role === 'admin') return [];
  return [...BY_STATE[accountState(account)]];
}

/** 확인 모달을 거치는 동작. 승인, 재개, 복구, 만료는 바로 한다. */
export function needsConfirm(action: ModerationAction): boolean {
  return action === 'revoke' || action === 'softDelete' || action === 'purge';
}

/** 완전 삭제는 소프트 삭제된 계정에만, 아이디를 그대로 입력했을 때만. */
export function canPurge(account: Pick<Account, 'status' | 'username'>, typed: string): boolean {
  return account.status === 'deleted' && typed === account.username;
}
