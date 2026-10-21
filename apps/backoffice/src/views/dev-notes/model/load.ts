// 개발노트 화면이 받는 두 가지: 보드 하나와 고른 이슈 하나의 상세.
// 다시 받는 중이거나 실패해도 이전 보드는 지우지 않는다. 상세는 고른 이슈가 바뀌면 비우고, 늦게 온 다른 이슈의 응답은 버린다.
// 401·403 은 views 가 먼저 가로챈다(useAuthErrorRedirect).
import { type BoardResponse, type IssueDetail, isTokenMissing } from '@/entities/issue';

export type LoadFailure = 'tokenMissing' | 'failed';

export function loadFailure(error: unknown): LoadFailure {
  return isTokenMissing(error) ? 'tokenMissing' : 'failed';
}

export type BoardLoad = {
  board: BoardResponse | null;
  loading: boolean;
  failure: LoadFailure | null;
};

export const INITIAL_BOARD: BoardLoad = { board: null, loading: true, failure: null };

export const boardStarted = (state: BoardLoad): BoardLoad => ({ ...state, loading: true });

export const boardSucceeded = (_state: BoardLoad, board: BoardResponse): BoardLoad => ({
  board,
  loading: false,
  failure: null,
});

export const boardFailed = (state: BoardLoad, error: unknown): BoardLoad => ({
  board: state.board,
  loading: false,
  failure: loadFailure(error),
});

export type DetailLoad = {
  number: number | null;
  detail: IssueDetail | null;
  failure: LoadFailure | null;
};

export const NO_DETAIL: DetailLoad = { number: null, detail: null, failure: null };

/** 같은 이슈를 다시 받으면 보이던 상세를 두고, 다른 이슈면 비운다. */
export function detailStarted(state: DetailLoad, number: number): DetailLoad {
  if (state.number === number) return state;
  return { number, detail: null, failure: null };
}

export function detailSucceeded(
  state: DetailLoad,
  number: number,
  detail: IssueDetail,
): DetailLoad {
  if (state.number !== number) return state;
  return { number, detail, failure: null };
}

export function detailFailed(state: DetailLoad, number: number, error: unknown): DetailLoad {
  if (state.number !== number) return state;
  return { ...state, failure: loadFailure(error) };
}
