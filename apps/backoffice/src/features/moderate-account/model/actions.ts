// 계정 행의 동작(화면 안 8절 "행 동작"). 보이는 상태가 버튼을 정하고, 관리자 행에는 동작을 두지 않는다(스스로 잠그는 사고를 막는다).
import {
  type Account,
  type AccountState,
  accountState,
  isPurgeable,
  purgeDaysLeft,
} from '@/entities/account';
import { toLocalInput } from './expiry';
import { PURGE_TEXT } from './texts';

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

/** 완전 삭제는 정지 3개월이 지난 계정에만, 아이디를 그대로 입력했을 때만. */
export function canPurge(
  account: Pick<Account, 'status' | 'username' | 'deletedAt'>,
  typed: string,
  now: Date = new Date(),
): boolean {
  return isPurgeable(account, now) && typed === account.username;
}

export type PurgeAvailability = { allowed: true } | { allowed: false; reason: string };

/** "완전 삭제" 버튼을 켤지, 끈다면 그 까닭(버튼의 title). */
export function purgeAvailability(
  account: Pick<Account, 'status' | 'deletedAt'>,
  now: Date = new Date(),
): PurgeAvailability {
  if (isPurgeable(account, now)) return { allowed: true };
  if (account.deletedAt === undefined) return { allowed: false, reason: PURGE_TEXT.noSuspendedAt };
  return { allowed: false, reason: PURGE_TEXT.daysLeft(purgeDaysLeft(account.deletedAt, now)) };
}

/** 정지된 계정의 정지 시각(로컬, 분까지). 아니면 undefined. */
export function suspendedAtText(
  account: Pick<Account, 'status' | 'deletedAt'>,
): string | undefined {
  if (account.status !== 'deleted' || account.deletedAt === undefined) return undefined;
  return PURGE_TEXT.suspendedAt(toLocalInput(account.deletedAt).replace('T', ' '));
}
