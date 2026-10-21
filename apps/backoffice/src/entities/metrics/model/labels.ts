// 역할 라벨은 엔티티의 것이라 여기 모은다. 화면의 다른 글은 views 와 widgets 에 둔다.
import type { BadgeTone } from '@/shared/ui';
import type { Purpose } from './types';

export const PURPOSE_LABELS: Record<Purpose, string> = {
  reply: '발화',
  crisis: '위기 판정',
  report: '리포트',
};

export const PURPOSE_TONES: Record<Purpose, BadgeTone> = {
  reply: 'neutral',
  crisis: 'warning',
  report: 'neutral',
};
