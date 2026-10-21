// 이슈 상태의 라벨은 엔티티의 것이라 여기 모은다. 화면의 다른 글은 views 와 widgets 에 둔다.
import type { BadgeTone } from '@/shared/ui';
import type { IssueState } from './types';

export const ISSUE_STATE_LABELS: Record<IssueState, string> = {
  open: '열림',
  closed: '닫힘',
};

export const ISSUE_STATE_TONES: Record<IssueState, BadgeTone> = {
  open: 'success',
  closed: 'neutral',
};
