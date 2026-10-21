// 보드 위젯이 받은 보드에서 구하는 것: 어느 화면을 보일지, 묶음의 이름, 고른 카드, 갱신 시각의 글.
import { type BoardGroup, OFF_BOARD_LABEL } from '@/entities/board';
import type { BoardResponse, IssueCard } from '@/entities/issue';

export const ISSUE_BOARD_TEXT = {
  label: '이슈 보드',
  loading: '보드를 불러오고 있어요',
  empty: '아직 이슈가 없어요.',
  emptyHint: 'PRD 를 이슈로 올리면 여기에 보여요.',
  emptyColumn: '이슈 없음',
  failed: '보드를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  staleFailed: '보드를 새로 받지 못해 이전에 받은 보드를 보이고 있어요.',
  retry: '다시 시도',
  tokenMissing: 'GITHUB_TOKEN 이 없어 개발노트를 볼 수 없어요.',
  tokenMissingHint:
    'apps/backoffice/.env 에 GITHUB_TOKEN 을 넣고 운영 화면을 다시 띄워 주세요. 다른 화면은 그대로 쓸 수 있어요.',
  justNow: '방금 전',
  updated: (when: string) => `${when} 갱신`,
  count: (count: number) => `${count}건`,
} as const;

export type BoardFailure = 'tokenMissing' | 'failed';

export type BoardView = 'loading' | 'tokenMissing' | 'failed' | 'empty' | 'ready';

/** 보일 화면과, 이전 보드 위에 "새로 받지 못함" 을 얹을지. 토큰 없음은 이전 보드보다 먼저다. */
export function boardScreen(
  board: BoardResponse | null,
  failure: BoardFailure | null,
): { view: BoardView; staleFailure: boolean } {
  if (failure === 'tokenMissing') return { view: 'tokenMissing', staleFailure: false };
  if (board === null) return { view: failure ? 'failed' : 'loading', staleFailure: false };
  if (board.cards.length === 0) return { view: 'empty', staleFailure: false };
  return { view: 'ready', staleFailure: failure === 'failed' };
}

export function groupTitle(group: BoardGroup): string {
  return group.kind === 'offBoard' ? OFF_BOARD_LABEL : group.name;
}

/** 고른 번호의 카드(열 이름을 품는다). 상세 응답에는 열이 없어 "구현 시작" 판정에 이것을 쓴다. */
export function findCard(board: BoardResponse | null, number: number | null): IssueCard | null {
  if (board === null || number === null) return null;
  return board.cards.find((card) => card.number === number) ?? null;
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

const RELATIVE = new Intl.RelativeTimeFormat('ko', { numeric: 'always' });

/** "5분 전", "3일 전". 1분이 안 되거나 조금 앞선 시각은 "방금 전". */
export function updatedText(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - Date.parse(iso);
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return RELATIVE.format(-Math.floor(elapsed / size), unit);
  }
  return ISSUE_BOARD_TEXT.justNow;
}
