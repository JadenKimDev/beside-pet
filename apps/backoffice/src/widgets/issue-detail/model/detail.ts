// 상세 위젯의 글과, "구현 시작" 판정에 넘길 이슈.
import type { IssueCard, IssueDetail } from '@/entities/issue';
import type { StartableIssue } from '@/features/start-implementation';

export const ISSUE_DETAIL_TEXT = {
  close: '닫기',
  openOnGitHub: 'GitHub 에서 보기',
  start: '구현 시작',
  started: 'run:implement 라벨을 붙였어요. 개발 자동화가 이 이슈를 가져가요.',
  loading: '이슈를 불러오고 있어요',
  failed: '이슈를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  tokenMissing: 'GITHUB_TOKEN 이 없어 이슈를 볼 수 없어요.',
  retry: '다시 시도',
  emptyBody: '본문이 없어요.',
  comments: (count: number) => `댓글 ${count}`,
  noComments: '아직 댓글이 없어요.',
  unknownAuthor: '알 수 없음',
  created: (when: string) => `${when} 작성`,
  updated: (when: string) => `${when} 갱신`,
} as const;

/** 상세가 오면 상태와 라벨은 상세(더 새것)에서, 열은 보드 카드에서. 상세가 오기 전이거나 다른 이슈면 카드만. */
export function startableIssue(
  card: IssueCard,
  detail: IssueDetail | null,
): StartableIssue & { number: number } {
  const fresh = detail !== null && detail.number === card.number ? detail : card;
  return { number: card.number, state: fresh.state, column: card.column, labels: fresh.labels };
}

const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 로컬 시각의 날짜와 시각. */
export function dateTimeText(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
