// "이슈로 올리기" 다섯 단계의 화면 라벨. 단계의 차례는 PUBLISH_STEPS 가 정본이다.
import type { PublishStep, PublishStepLog } from '@/features/publish-prd';
import type { BadgeTone } from '@/shared/ui';

export const PUBLISH_STEP_LABELS = {
  push: '이슈 만들기',
  ledger: '원장 만들기',
  commit: '원장 커밋',
  'git-push': 'main 푸시',
  worktree: '워크트리 만들기',
} as const satisfies Record<PublishStep, string>;

export function publishStepLabel(step: PublishStep): string {
  return PUBLISH_STEP_LABELS[step];
}

type StepStatus = PublishStepLog['status'];

export const STEP_STATUS_LABELS = {
  pending: '대기',
  running: '진행 중',
  ok: '완료',
  failed: '실패',
} as const satisfies Record<StepStatus, string>;

export const STEP_STATUS_TONES = {
  pending: 'neutral',
  running: 'warning',
  ok: 'success',
  failed: 'danger',
} as const satisfies Record<StepStatus, BadgeTone>;
