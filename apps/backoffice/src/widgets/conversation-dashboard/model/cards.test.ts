import { describe, expect, it } from 'vitest';
import {
  conversationCards,
  conversationChartRows,
  hasConversations,
  replyLabelRows,
} from './cards';
import { conversationDay, conversationsResponse } from './tests/fixtures';

const cardsOf = (days: Parameters<typeof conversationsResponse>[0]) =>
  Object.fromEntries(conversationCards(conversationsResponse(days)).map((card) => [card.id, card]));

describe('conversationCards', () => {
  it('sums sessions, turns and crisis turns over the period', () => {
    const cards = cardsOf([
      conversationDay({ sessions: 3, turns: 10, crisis: { keyword: 3, model: 1 } }),
      conversationDay({
        date: '2026-10-15',
        sessions: 2,
        turns: 6,
        crisis: { keyword: 1, model: 1 },
      }),
    ]);
    expect(cards.sessions.value).toBe('5');
    expect(cards.turns.value).toBe('16');
    expect(cards.turns.note).toBe('대화당 평균 3.2턴');
    expect(cards.crisis.value).toBe('6');
    expect(cards.crisis.note).toBe('키워드 4 · 모델 판정 2');
    expect(cards.crisis.tone).toBe('warning');
  });

  it('drops the average when there are no sessions and does not warn without crisis', () => {
    const cards = cardsOf([]);
    expect(cards.sessions.value).toBe('0');
    expect(cards.turns.note).toBeUndefined();
    expect(cards.crisis.tone).toBeUndefined();
  });
});

describe('conversationChartRows', () => {
  it('fills the empty UTC days with zero', () => {
    const response = conversationsResponse([conversationDay({ date: '2026-10-15', sessions: 4 })]);
    const rows = conversationChartRows(response);
    expect(rows.map((row) => [row.date, row.sessions, row.keyword])).toEqual([
      ['2026-10-14', 0, 0],
      ['2026-10-15', 4, 0],
      ['2026-10-16', 0, 0],
    ]);
    expect(hasConversations(rows)).toBe(true);
    expect(hasConversations(conversationChartRows(conversationsResponse([])))).toBe(false);
  });
});

describe('replyLabelRows', () => {
  it('gives each UTC day the judged reply counts and the generic comfort share', () => {
    const response = conversationsResponse([
      conversationDay({
        date: '2026-10-15',
        replyLabels: { generic_comfort: 3, specific_reflection: 4, question: 1 },
      }),
    ]);
    expect(replyLabelRows(response)).toEqual([
      { date: '2026-10-14', generic: '0', specific: '0', question: '0', genericRate: '–' },
      { date: '2026-10-15', generic: '3', specific: '4', question: '1', genericRate: '37.5%' },
      { date: '2026-10-16', generic: '0', specific: '0', question: '0', genericRate: '–' },
    ]);
  });
});
