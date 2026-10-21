// `daily` 행을 그래프용 날짜 열로 바꾼다. 서버는 활동이 없는 날의 행을 만들지 않으므로 기간의 UTC 날짜를 모두
// 채우고 빈 날은 0 으로 둔다.
import { dateKeysBetween, ratio } from '@/shared/lib';
import type { ConversationDay, DailyUsage, ReplyLabelCounts } from './types';

/** 날짜 하루의 모델 사용량(모델을 고르지 않으면 모든 모델의 합). */
export type UsageDay = {
  date: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type ConversationSummary = {
  sessions: number;
  turns: number;
  crisis: { keyword: number; model: number };
  crisisTotal: number;
  /** turns / sessions. 대화가 없으면 null. */
  turnsPerSession: number | null;
};

/** 모델 고르기의 키: `provider / model`. */
export function modelKey(row: Pick<DailyUsage, 'provider' | 'model'>): string {
  return `${row.provider} / ${row.model}`;
}

/** `daily` 의 서로 다른 모델 키, 글자 순. */
export function modelKeysOf(daily: readonly DailyUsage[]): string[] {
  return [...new Set(daily.map(modelKey))].sort();
}

const emptyUsage = (date: string): UsageDay => ({
  date,
  calls: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
});

/** `from`..`to` 의 UTC 날짜마다 한 줄. `model` 을 주면 그 모델만, 아니면 날짜마다 모든 모델을 더한다. */
export function fillModelDays(
  daily: readonly DailyUsage[],
  from: string,
  to: string,
  model?: string,
): UsageDay[] {
  const byDate = new Map(dateKeysBetween(from, to).map((date) => [date, emptyUsage(date)]));
  for (const row of daily) {
    const target = byDate.get(row.date);
    if (!target || (model !== undefined && modelKey(row) !== model)) continue;
    target.calls += row.calls;
    target.errors += row.errors;
    target.inputTokens += row.inputTokens;
    target.outputTokens += row.outputTokens;
    target.costUsd += row.costUsd;
  }
  return [...byDate.values()];
}

/** `from`..`to` 의 UTC 날짜마다 한 줄. 행이 없는 날은 0. */
export function fillConversationDays(
  daily: readonly ConversationDay[],
  from: string,
  to: string,
): ConversationDay[] {
  const found = new Map(daily.map((row) => [row.date, row]));
  return dateKeysBetween(from, to).map(
    (date) =>
      found.get(date) ?? {
        date,
        sessions: 0,
        turns: 0,
        crisis: { keyword: 0, model: 0 },
        replyLabels: { generic_comfort: 0, specific_reflection: 0, question: 0 },
      },
  );
}

/** 판정한 답 가운데 일반 위로의 몫(0..1). 판정이 하나도 없으면 null. */
export function genericComfortRate(labels: ReplyLabelCounts): number | null {
  const judged = labels.generic_comfort + labels.specific_reflection + labels.question;
  return ratio(labels.generic_comfort, judged);
}

export function summarizeConversations(days: readonly ConversationDay[]): ConversationSummary {
  let sessions = 0;
  let turns = 0;
  let keyword = 0;
  let model = 0;
  for (const day of days) {
    sessions += day.sessions;
    turns += day.turns;
    keyword += day.crisis.keyword;
    model += day.crisis.model;
  }
  return {
    sessions,
    turns,
    crisis: { keyword, model },
    crisisTotal: keyword + model,
    turnsPerSession: sessions === 0 ? null : turns / sessions,
  };
}
