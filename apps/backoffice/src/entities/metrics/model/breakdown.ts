// `models` 행의 거르기와 합산. 카드와 나눠 보기 표가 쓴다.
import { ratio } from '@/shared/lib';
import type { ModelUsage, Purpose } from './types';

export const PURPOSES: readonly Purpose[] = ['reply', 'crisis', 'report', 'judge'];

/** 역할과 프롬프트 버전 거르기. `'all'` 은 거르지 않는다. */
export type BreakdownFilter = { purpose: Purpose | 'all'; version: string | 'all' };

/** 백분위는 행끼리 더하거나 평균할 수 없다. 행이 하나면 `min === max`, 여럿이면 가장 작은 값과 큰 값. */
export type Spread = { min: number; max: number };

export type UsageSummary = {
  /** 합친 묶음(행) 수. */
  groups: number;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** errors / calls. 호출이 없으면 null. */
  failureRate: number | null;
  p50Ms: Spread | null;
  p95Ms: Spread | null;
  /** 스트리밍 호출이 있는 행만 본다. 하나도 없으면 null. */
  firstTokenP50Ms: Spread | null;
};

export function filterUsage(rows: readonly ModelUsage[], filter: BreakdownFilter): ModelUsage[] {
  return rows.filter(
    (row) =>
      (filter.purpose === 'all' || row.purpose === filter.purpose) &&
      (filter.version === 'all' || row.promptVersion === filter.version),
  );
}

/** 응답에 있는 역할. 차례는 발화, 위기 판정, 리포트, 판정으로 고정이다. */
export function purposesOf(rows: readonly ModelUsage[]): Purpose[] {
  const present = new Set(rows.map((row) => row.purpose));
  return PURPOSES.filter((purpose) => present.has(purpose));
}

/** 서로 다른 프롬프트 버전, 글자 순 내림차순(최신이 위). */
export function promptVersionsOf(rows: readonly ModelUsage[]): string[] {
  return [...new Set(rows.map((row) => row.promptVersion))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
}

export function failureRate(row: Pick<ModelUsage, 'calls' | 'errors'>): number | null {
  return ratio(row.errors, row.calls);
}

function spread(values: readonly number[]): Spread | null {
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function summarizeUsage(rows: readonly ModelUsage[]): UsageSummary {
  const sum = (pick: (row: ModelUsage) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const calls = sum((row) => row.calls);
  const errors = sum((row) => row.errors);
  const firstTokens = rows.flatMap((row) =>
    row.firstTokenP50Ms === undefined ? [] : [row.firstTokenP50Ms],
  );
  return {
    groups: rows.length,
    calls,
    errors,
    inputTokens: sum((row) => row.inputTokens),
    outputTokens: sum((row) => row.outputTokens),
    costUsd: sum((row) => row.costUsd),
    failureRate: failureRate({ calls, errors }),
    p50Ms: spread(rows.map((row) => row.p50Ms)),
    p95Ms: spread(rows.map((row) => row.p95Ms)),
    firstTokenP50Ms: spread(firstTokens),
  };
}

/** 호출 내림차순. 받은 목록은 바꾸지 않는다. */
export function sortByCalls(rows: readonly ModelUsage[]): ModelUsage[] {
  return [...rows].sort((a, b) => b.calls - a.calls);
}
