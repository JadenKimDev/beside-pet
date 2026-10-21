// 테스트 픽스처. 수치는 지어낸 값이다.
import type { ConversationDay, DailyUsage, ModelUsage } from '../types';

export function usage(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    provider: 'anthropic',
    model: 'example-model',
    purpose: 'reply',
    promptVersion: 'reply-v1',
    calls: 10,
    errors: 0,
    inputTokens: 1000,
    outputTokens: 200,
    p50Ms: 1000,
    p95Ms: 2000,
    costUsd: 0.01,
    ...overrides,
  };
}

export function day(overrides: Partial<DailyUsage>): DailyUsage {
  return {
    date: '2026-10-14',
    provider: 'anthropic',
    model: 'example-model',
    calls: 5,
    errors: 1,
    inputTokens: 500,
    outputTokens: 100,
    costUsd: 0.5,
    ...overrides,
  };
}

export function conversationDay(overrides: Partial<ConversationDay>): ConversationDay {
  return {
    date: '2026-10-14',
    sessions: 2,
    turns: 6,
    crisis: { keyword: 1, model: 0 },
    ...overrides,
  };
}
