/** Route Handler(`/api/github/...`)가 돌려주는 모양. 화면(entities)이 이 타입으로 받는다. */

/** 보드의 열 이름. 보드의 Status 필드 값 그대로다. */
export const BOARD_COLUMNS = ['Backlog', 'In progress', 'In review', 'Done'] as const;
export type BoardColumnName = (typeof BOARD_COLUMNS)[number];

export type IssueState = 'open' | 'closed';

export type IssueLabel = { name: string; color: string };

/** 보드의 카드 하나. 보드에 없는 이슈는 `column: null` 이다. 보드에 알 수 없는 열 이름이 있으면 그 이름 그대로다. */
export type IssueCard = {
  number: number;
  title: string;
  labels: IssueLabel[];
  updatedAt: string;
  state: IssueState;
  column: string | null;
  url: string;
};

/** `GET /api/github/board`. `columns` 는 열의 차례, `cards` 는 이 레포의 이슈 전부(열린 것과 닫힌 것). */
export type BoardResponse = {
  columns: readonly BoardColumnName[];
  cards: IssueCard[];
};

export type IssueComment = {
  id: number;
  author: string | null;
  body: string;
  createdAt: string;
};

/** `GET /api/github/issues/[number]`. `body` 는 마크다운 그대로다. */
export type IssueDetailResponse = {
  number: number;
  title: string;
  state: IssueState;
  labels: IssueLabel[];
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: IssueComment[];
};

/** `POST /api/github/issues/[number]/labels` 의 요청 본문. */
export type AddLabelRequest = { label: string };

/** 라벨을 붙인 뒤 그 이슈의 라벨 전부. */
export type AddLabelResponse = { labels: IssueLabel[] };

/** 오류 응답 본문. */
export type GitHubErrorResponse = { error: string };
