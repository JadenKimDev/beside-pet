// 상태와 역할의 라벨은 엔티티의 것이라 여기 모은다. 화면의 다른 글은 views 와 widgets 에 둔다.
import type { BadgeTone } from '@/shared/ui';
import type { AccountState } from './state';
import type { AccountRole } from './types';

export const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  pending: '승인 대기',
  active: '활성',
  expired: '만료됨',
  revoked: '정지됨',
  deleted: '삭제됨',
};

export const ACCOUNT_STATE_TONES: Record<AccountState, BadgeTone> = {
  pending: 'warning',
  active: 'success',
  expired: 'neutral',
  revoked: 'danger',
  deleted: 'neutral',
};

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: '관리자',
  viewer: '일반',
};
