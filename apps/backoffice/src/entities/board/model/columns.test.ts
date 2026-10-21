import { describe, expect, it } from 'vitest';
import type { BoardResponse, IssueCard } from '@/shared/github';
import { groupByColumn, sortCards } from './columns';

const COLUMNS = ['Backlog', 'In progress', 'In review', 'Done'] as const;

function card(number: number, overrides: Partial<IssueCard> = {}): IssueCard {
  return {
    number,
    title: `예시 이슈 ${number}`,
    labels: [],
    updatedAt: '2026-10-20T00:00:00Z',
    state: 'open',
    column: 'Backlog',
    url: `https://github.com/example/repo/issues/${number}`,
    ...overrides,
  };
}

const board = (cards: IssueCard[]): BoardResponse => ({ columns: COLUMNS, cards });

describe('sortCards', () => {
  it('puts the most recently updated first, then the higher number on a tie', () => {
    const cards = [
      card(1, { updatedAt: '2026-10-18T00:00:00Z' }),
      card(2, { updatedAt: '2026-10-20T00:00:00Z' }),
      card(3, { updatedAt: '2026-10-19T00:00:00Z' }),
      card(4, { updatedAt: '2026-10-20T00:00:00Z' }),
    ];
    expect(sortCards(cards).map((c) => c.number)).toEqual([4, 2, 3, 1]);
  });

  it('does not change the given array', () => {
    const cards = [card(1, { updatedAt: '2026-10-18T00:00:00Z' }), card(2)];
    sortCards(cards);
    expect(cards.map((c) => c.number)).toEqual([1, 2]);
  });
});

describe('groupByColumn', () => {
  it('keeps every board column in the given order, even when empty', () => {
    const groups = groupByColumn(board([card(1, { column: 'In review' })]));
    expect(groups.map((g) => (g.kind === 'offBoard' ? null : g.name))).toEqual([...COLUMNS]);
    expect(groups.map((g) => g.cards.length)).toEqual([0, 0, 1, 0]);
    expect(groups.every((g) => g.kind === 'column')).toBe(true);
  });

  it('follows the order of the response columns, not a fixed list', () => {
    const groups = groupByColumn({
      columns: ['Done', 'Backlog'],
      cards: [],
    } as unknown as BoardResponse);
    expect(groups.map((g) => (g.kind === 'offBoard' ? null : g.name))).toEqual(['Done', 'Backlog']);
  });

  it('sorts the cards in each column by updatedAt descending', () => {
    const groups = groupByColumn(
      board([
        card(1, { updatedAt: '2026-10-18T00:00:00Z' }),
        card(2, { updatedAt: '2026-10-20T00:00:00Z' }),
        card(3, { updatedAt: '2026-10-19T00:00:00Z', column: 'Done', state: 'closed' }),
      ]),
    );
    expect(groups[0].cards.map((c) => c.number)).toEqual([2, 1]);
    expect(groups[3].cards.map((c) => c.number)).toEqual([3]);
  });

  it('appends unknown column names after the known ones, by name, as they are', () => {
    const groups = groupByColumn(
      board([
        card(1, { column: 'Todo' }),
        card(2, { column: 'Blocked' }),
        card(3, { column: 'Todo', updatedAt: '2026-10-21T00:00:00Z' }),
        card(4, { column: 'Backlog' }),
      ]),
    );
    expect(groups.map((g) => (g.kind === 'offBoard' ? null : g.name))).toEqual([
      ...COLUMNS,
      'Blocked',
      'Todo',
    ]);
    expect(groups[4]).toMatchObject({ kind: 'unknown', name: 'Blocked' });
    expect(groups[5].cards.map((c) => c.number)).toEqual([3, 1]);
  });

  it('puts open issues that are not on the board into a last off-board group', () => {
    const groups = groupByColumn(
      board([
        card(1),
        card(2, { column: null }),
        card(3, { column: null, updatedAt: '2026-10-21T00:00:00Z' }),
      ]),
    );
    const last = groups[groups.length - 1];
    expect(last.kind).toBe('offBoard');
    expect(last.cards.map((c) => c.number)).toEqual([3, 2]);
  });

  it('leaves out closed issues that are not on the board', () => {
    const groups = groupByColumn(board([card(1), card(2, { column: null, state: 'closed' })]));
    expect(groups.some((g) => g.kind === 'offBoard')).toBe(false);
    expect(groups.flatMap((g) => g.cards).map((c) => c.number)).toEqual([1]);
  });

  it('has no off-board group when every card is on the board', () => {
    const groups = groupByColumn(board([card(1), card(2, { column: 'Done', state: 'closed' })]));
    expect(groups).toHaveLength(COLUMNS.length);
  });

  it('places each kept card exactly once', () => {
    const cards = [
      card(1),
      card(2, { column: 'Todo' }),
      card(3, { column: null }),
      card(4, { column: 'Done', state: 'closed' }),
      card(5, { column: 'In progress' }),
    ];
    const placed = groupByColumn(board(cards)).flatMap((g) => g.cards.map((c) => c.number));
    expect([...placed].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
