// 날짜별 그래프의 데이터(화면 안 6절 "그래프 셋"). `daily` 에는 역할과 버전이 없어 거르기가 걸리지 않는다.
import { fillModelDays, type ModelsResponse, modelKeysOf, type UsageDay } from '@/entities/metrics';
import { formatCount } from '@/shared/lib';
import type { SelectOption } from '@/shared/ui';

/** 모델 고르기의 '전체 모델' 값. */
export const ALL_MODELS = 'all';

export function chartModelOptions(response: ModelsResponse): SelectOption[] {
  return [
    { value: ALL_MODELS, label: '전체 모델' },
    ...modelKeysOf(response.daily).map((key) => ({ value: key, label: key })),
  ];
}

/** 기간의 UTC 날짜마다 한 줄. 고른 모델이 응답에 없으면 모든 모델을 더한다. */
export function usageChartRows(response: ModelsResponse, model: string): UsageDay[] {
  const known = modelKeysOf(response.daily).includes(model);
  return fillModelDays(response.daily, response.from, response.to, known ? model : undefined);
}

export function hasUsage(rows: readonly UsageDay[]): boolean {
  return rows.some((row) => row.calls > 0 || row.inputTokens > 0 || row.costUsd > 0);
}

/** `YYYY-MM-DD` → `MM/DD`. */
export function shortDate(date: string): string {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

/** 토큰 눈금: 만 이상은 만 단위(소수 한 자리까지), 아래는 천 단위 쉼표. */
export function formatTokenTick(value: number): string {
  if (Math.abs(value) < 10000) return formatCount(value);
  return `${Number((value / 10000).toFixed(1))}만`;
}
