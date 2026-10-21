import { describe, expect, it } from 'vitest';
import {
  fillConversationDays,
  fillModelDays,
  genericComfortRate,
  modelKey,
  modelKeysOf,
  summarizeConversations,
} from './daily';
import { conversationDay, day } from './tests/fixtures';

const FROM = '2026-10-13T09:30:00.000Z';
const TO = '2026-10-16T02:00:00.000Z';

describe('modelKey / modelKeysOf', () => {
  it('names a model as provider / model and lists distinct names', () => {
    expect(modelKey({ provider: 'ollama', model: 'example-7b' })).toBe('ollama / example-7b');
    expect(
      modelKeysOf([
        day({ provider: 'ollama', model: 'example-7b' }),
        day({}),
        day({ provider: 'ollama', model: 'example-7b', date: '2026-10-15' }),
      ]),
    ).toEqual(['anthropic / example-model', 'ollama / example-7b']);
  });
});

describe('fillModelDays', () => {
  const daily = [
    day({
      date: '2026-10-14',
      calls: 5,
      errors: 1,
      inputTokens: 500,
      outputTokens: 100,
      costUsd: 0.5,
    }),
    day({
      date: '2026-10-14',
      provider: 'ollama',
      model: 'example-7b',
      calls: 3,
      errors: 0,
      inputTokens: 300,
      outputTokens: 60,
      costUsd: 0,
    }),
    day({
      date: '2026-10-16',
      calls: 2,
      errors: 2,
      inputTokens: 20,
      outputTokens: 0,
      costUsd: 0.25,
    }),
  ];

  it('gives every UTC day from..to, filling missing days with zero and summing all models', () => {
    expect(fillModelDays(daily, FROM, TO)).toEqual([
      { date: '2026-10-13', calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      {
        date: '2026-10-14',
        calls: 8,
        errors: 1,
        inputTokens: 800,
        outputTokens: 160,
        costUsd: 0.5,
      },
      { date: '2026-10-15', calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      { date: '2026-10-16', calls: 2, errors: 2, inputTokens: 20, outputTokens: 0, costUsd: 0.25 },
    ]);
  });

  it('keeps only one model when a model key is given', () => {
    const days = fillModelDays(daily, FROM, TO, 'ollama / example-7b');
    expect(days.map((d) => d.calls)).toEqual([0, 3, 0, 0]);
  });

  it('draws a single day when the period is today only', () => {
    expect(fillModelDays([], '2026-10-21T00:00:00.000Z', '2026-10-21T05:00:00.000Z')).toEqual([
      { date: '2026-10-21', calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ]);
  });
});

describe('fillConversationDays', () => {
  it('fills days without activity with zero', () => {
    const days = fillConversationDays(
      [
        conversationDay({
          date: '2026-10-15',
          sessions: 3,
          turns: 9,
          crisis: { keyword: 1, model: 2 },
          replyLabels: { generic_comfort: 4, specific_reflection: 3, question: 2 },
        }),
      ],
      FROM,
      TO,
    );
    const none = { generic_comfort: 0, specific_reflection: 0, question: 0 };
    expect(days).toEqual([
      {
        date: '2026-10-13',
        sessions: 0,
        turns: 0,
        crisis: { keyword: 0, model: 0 },
        replyLabels: none,
      },
      {
        date: '2026-10-14',
        sessions: 0,
        turns: 0,
        crisis: { keyword: 0, model: 0 },
        replyLabels: none,
      },
      {
        date: '2026-10-15',
        sessions: 3,
        turns: 9,
        crisis: { keyword: 1, model: 2 },
        replyLabels: { generic_comfort: 4, specific_reflection: 3, question: 2 },
      },
      {
        date: '2026-10-16',
        sessions: 0,
        turns: 0,
        crisis: { keyword: 0, model: 0 },
        replyLabels: none,
      },
    ]);
  });
});

describe('summarizeConversations', () => {
  it('sums sessions, turns and crisis by detector, with turns per session', () => {
    expect(
      summarizeConversations([
        conversationDay({ sessions: 2, turns: 6, crisis: { keyword: 1, model: 0 } }),
        conversationDay({ sessions: 3, turns: 10, crisis: { keyword: 3, model: 2 } }),
      ]),
    ).toEqual({
      sessions: 5,
      turns: 16,
      crisis: { keyword: 4, model: 2 },
      crisisTotal: 6,
      turnsPerSession: 3.2,
    });
  });

  it('has no turns per session without sessions', () => {
    expect(summarizeConversations([]).turnsPerSession).toBeNull();
  });
});

describe('genericComfortRate', () => {
  it('is the share of generic comfort among the judged replies', () => {
    expect(genericComfortRate({ generic_comfort: 1, specific_reflection: 2, question: 1 })).toBe(
      0.25,
    );
  });

  it('is null when no reply was judged', () => {
    expect(
      genericComfortRate({ generic_comfort: 0, specific_reflection: 0, question: 0 }),
    ).toBeNull();
  });
});
