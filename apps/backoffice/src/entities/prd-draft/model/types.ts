// 이벤트 타입의 정본은 서버 전용 모듈 `@/shared/claude` 다. 화면은 타입만 가져온다(값을 가져오면 node 코드가 번들에 들어간다).
import type { PublishStep } from '@/shared/claude';

export type { ChatEvent, PublishEvent, PublishStatus, PublishStep } from '@/shared/claude';

/** `docs/prd/` 아래의 초안 하나. `GET /api/prd-chat/drafts/[file]` 의 응답. */
export type PrdDraft = {
  /** 파일 이름(basename). */
  file: string;
  /** 마크다운 본문. */
  body: string;
  /** 마지막으로 고친 때(ISO). */
  updatedAt: string;
};

/** "이슈로 올리기" 의 다섯 단계를 도는 차례. 각 단계의 라벨은 화면(widgets)이 정한다. */
export const PUBLISH_STEPS = [
  'push',
  'ledger',
  'commit',
  'git-push',
  'worktree',
] as const satisfies readonly PublishStep[];
