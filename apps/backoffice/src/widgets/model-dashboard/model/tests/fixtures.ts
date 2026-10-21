// 테스트 픽스처. 계정, 모델 이름, 수치는 모두 지어낸 값이다.
import type { DailyUsage, ModelsResponse, ModelUsage } from '@/entities/metrics';

export function usageRow(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    provider: 'example-provider',
    model: 'example-model-s',
    purpose: 'reply',
    promptVersion: 'reply-v1',
    calls: 10,
    errors: 0,
    inputTokens: 1000,
    outputTokens: 200,
    p50Ms: 900,
    p95Ms: 2100,
    costUsd: 0.12,
    ...overrides,
  };
}

export function dailyRow(overrides: Partial<DailyUsage>): DailyUsage {
  return {
    date: '2026-10-14',
    provider: 'example-provider',
    model: 'example-model-s',
    calls: 5,
    errors: 1,
    inputTokens: 500,
    outputTokens: 100,
    costUsd: 0.5,
    ...overrides,
  };
}

export function modelsResponse(overrides: Partial<ModelsResponse>): ModelsResponse {
  return {
    from: '2026-10-14T03:00:00.000Z',
    to: '2026-10-16T03:00:00.000Z',
    models: [],
    daily: [],
    ...overrides,
  };
}
