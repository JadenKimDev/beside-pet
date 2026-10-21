import { describe, expect, it } from 'vitest';
import type { BoardResponse, IssueDetail } from '@/entities/issue';
import { ApiError } from '@/shared/api';
import {
  boardFailed,
  boardStarted,
  boardSucceeded,
  detailFailed,
  detailStarted,
  detailSucceeded,
  INITIAL_BOARD,
  loadFailure,
  NO_DETAIL,
} from './load';

// 지어낸 값이다.
const board: BoardResponse = {
  columns: ['Backlog', 'In progress', 'In review', 'Done'],
  cards: [
    {
      number: 901,
      title: '예시 이슈',
      labels: [],
      updatedAt: '2026-10-01T00:00:00Z',
      state: 'open',
      column: 'Backlog',
      url: 'https://github.com/example/repo/issues/901',
    },
  ],
};

const detail = (number: number): IssueDetail => ({
  number,
  title: '예시 이슈',
  state: 'open',
  labels: [],
  body: '본문',
  url: `https://github.com/example/repo/issues/${number}`,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  comments: [],
});

const tokenMissing = new ApiError(503, 'GITHUB_TOKEN is not set');

describe('loadFailure', () => {
  it('tells the missing token apart from other failures', () => {
    expect(loadFailure(tokenMissing)).toBe('tokenMissing');
    expect(loadFailure(new ApiError(503, 'Service unavailable'))).toBe('failed');
    expect(loadFailure(new ApiError(502, 'Bad gateway'))).toBe('failed');
    expect(loadFailure(new TypeError('fetch failed'))).toBe('failed');
  });
});

describe('board load', () => {
  it('starts loading without a board', () => {
    expect(INITIAL_BOARD).toEqual({ board: null, loading: true, failure: null });
  });

  it('keeps the previous board while reloading and after a failure', () => {
    const loaded = boardSucceeded(INITIAL_BOARD, board);
    expect(loaded).toEqual({ board, loading: false, failure: null });
    const reloading = boardStarted(loaded);
    expect(reloading).toEqual({ board, loading: true, failure: null });
    expect(boardFailed(reloading, new ApiError(502, 'Bad gateway'))).toEqual({
      board,
      loading: false,
      failure: 'failed',
    });
  });

  it('records the missing token', () => {
    expect(boardFailed(INITIAL_BOARD, tokenMissing).failure).toBe('tokenMissing');
  });

  it('clears the failure on success', () => {
    const failed = boardFailed(INITIAL_BOARD, new ApiError(502, 'Bad gateway'));
    expect(boardSucceeded(failed, board).failure).toBeNull();
  });
});

describe('detail load', () => {
  it('has no issue before one is chosen', () => {
    expect(NO_DETAIL).toEqual({ number: null, detail: null, failure: null });
  });

  it('drops the previous detail when another issue is chosen, keeps it when the same one reloads', () => {
    const first = detailSucceeded(detailStarted(NO_DETAIL, 901), 901, detail(901));
    expect(first).toEqual({ number: 901, detail: detail(901), failure: null });
    expect(detailStarted(first, 901)).toEqual(first);
    expect(detailStarted(first, 902)).toEqual({ number: 902, detail: null, failure: null });
  });

  it('ignores a response for an issue that is no longer chosen', () => {
    const second = detailStarted(detailStarted(NO_DETAIL, 901), 902);
    expect(detailSucceeded(second, 901, detail(901))).toBe(second);
    expect(detailFailed(second, 901, new ApiError(502, 'Bad gateway'))).toBe(second);
  });

  it('records the failure of the chosen issue and clears it on success', () => {
    const failed = detailFailed(detailStarted(NO_DETAIL, 901), 901, tokenMissing);
    expect(failed).toEqual({ number: 901, detail: null, failure: 'tokenMissing' });
    expect(detailSucceeded(failed, 901, detail(901)).failure).toBeNull();
  });
});
