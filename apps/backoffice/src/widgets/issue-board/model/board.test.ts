import { describe, expect, it } from 'vitest';
import type { BoardResponse, IssueCard } from '@/entities/issue';
import { boardScreen, findCard, groupTitle, updatedText } from './board';

// 지어낸 값이다.
const card = (number: number, over: Partial<IssueCard> = {}): IssueCard => ({
  number,
  title: `예시 이슈 ${number}`,
  labels: [],
  updatedAt: '2026-10-01T00:00:00Z',
  state: 'open',
  column: 'Backlog',
  url: `https://github.com/example/repo/issues/${number}`,
  ...over,
});

const board: BoardResponse = {
  columns: ['Backlog', 'In progress', 'In review', 'Done'],
  cards: [card(901), card(902, { column: 'In review' }), card(903, { column: null })],
};

describe('boardScreen', () => {
  it('waits before the first board', () => {
    expect(boardScreen(null, null)).toEqual({ view: 'loading', staleFailure: false });
  });

  it('shows the token notice whenever the token is missing, even over an old board', () => {
    expect(boardScreen(null, 'tokenMissing')).toEqual({
      view: 'tokenMissing',
      staleFailure: false,
    });
    expect(boardScreen(board, 'tokenMissing')).toEqual({
      view: 'tokenMissing',
      staleFailure: false,
    });
  });

  it('shows the failure without a board, and keeps the old board with an alert after one', () => {
    expect(boardScreen(null, 'failed')).toEqual({ view: 'failed', staleFailure: false });
    expect(boardScreen(board, 'failed')).toEqual({ view: 'ready', staleFailure: true });
  });

  it('is empty when there are no cards at all', () => {
    expect(boardScreen({ columns: board.columns, cards: [] }, null)).toEqual({
      view: 'empty',
      staleFailure: false,
    });
    expect(boardScreen(board, null)).toEqual({ view: 'ready', staleFailure: false });
  });
});

describe('groupTitle', () => {
  it('uses the column name, and the off-board label for issues not on the board', () => {
    expect(groupTitle({ kind: 'column', name: 'In review', cards: [] })).toBe('In review');
    expect(groupTitle({ kind: 'unknown', name: 'Todo', cards: [] })).toBe('Todo');
    expect(groupTitle({ kind: 'offBoard', cards: [] })).toBe('보드 밖');
  });
});

describe('findCard', () => {
  it('finds the chosen card with its column', () => {
    expect(findCard(board, 902)).toMatchObject({ number: 902, column: 'In review' });
    expect(findCard(board, 903)?.column).toBeNull();
  });

  it('is null before a choice, before the board or for an unknown number', () => {
    expect(findCard(board, null)).toBeNull();
    expect(findCard(null, 901)).toBeNull();
    expect(findCard(board, 999)).toBeNull();
  });
});

describe('updatedText', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('says how long ago in Korean', () => {
    expect(updatedText('2026-10-10T11:59:30Z', now)).toBe('방금 전');
    expect(updatedText('2026-10-10T11:55:00Z', now)).toBe('5분 전');
    expect(updatedText('2026-10-10T09:00:00Z', now)).toBe('3시간 전');
    expect(updatedText('2026-10-07T12:00:00Z', now)).toBe('3일 전');
  });

  it('does not go negative for a time slightly ahead', () => {
    expect(updatedText('2026-10-10T12:00:05Z', now)).toBe('방금 전');
  });
});
