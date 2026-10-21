// 계측 응답(apps/server/src/metrics/api.rs 의 `ModelsResponse`, `ConversationsResponse`, source.rs 의 행).
// `from`, `to` 는 ms 까지의 ISO 시각, `date` 는 UTC 의 `YYYY-MM-DD` 다.

/** `llm_calls.purpose` 의 DB CHECK 세 값. */
export type Purpose = 'reply' | 'crisis' | 'report';

/** (provider, model, purpose, promptVersion) 묶음 하나. 스트리밍 호출이 없으면 `firstTokenP50Ms` 칸이 없다. */
export type ModelUsage = {
  provider: string;
  model: string;
  purpose: Purpose;
  promptVersion: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  p50Ms: number;
  p95Ms: number;
  firstTokenP50Ms?: number;
  costUsd: number;
};

/** (UTC 날짜, provider, model) 묶음 하나. 호출이 없는 날은 행이 없다. */
export type DailyUsage = {
  date: string;
  provider: string;
  model: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type ModelsResponse = {
  from: string;
  to: string;
  models: ModelUsage[];
  daily: DailyUsage[];
};

/** 위기 턴 수를 잡은 쪽(키워드, 모델 판정)으로 나눈 것. */
export type CrisisCounts = { keyword: number; model: number };

/** UTC 날짜 하루. 활동이 없는 날은 행이 없다. */
export type ConversationDay = {
  date: string;
  sessions: number;
  turns: number;
  crisis: CrisisCounts;
};

export type ConversationsResponse = {
  from: string;
  to: string;
  daily: ConversationDay[];
};
