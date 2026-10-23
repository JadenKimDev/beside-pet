// PRD 의 `## 추정`(낙관·현실·비관)과 원장의 실측(outcomes.jsonl)을 맞대어 추정의 정확도를 잰다.
//
// 추정 값은 "작업 15분, 전체 30분" 처럼 작업 합계와 전체(리드 타임)를 따로 적을 수 있고,
// 하나만 적으면 작업 합계로 본다. 단위는 분, 시간, 일(= 8시간), 반나절(= 4시간)이다.

import type { Outcome } from "./ledger.ts";

export type Estimate = { work_ms: number; lead_ms: number | null };
export type EstimateRow = { optimistic: Estimate; realistic: Estimate; pessimistic: Estimate };

const HOUR = 60 * 60 * 1000;
const DAY = 8 * HOUR;
const HALF_DAY = 4 * HOUR;
const LABELS: Record<string, keyof EstimateRow> = { 낙관: "optimistic", 현실: "realistic", 비관: "pessimistic" };

/** "1시간 30분", "반나절", "1.5일" 을 밀리초로. 단위가 없으면 null. */
export function parseDuration(text: string): number | null {
  let total = 0;
  let found = false;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*(일|시간|분)/g)) {
    const value = Number(amount);
    total += unit === "일" ? value * DAY : unit === "시간" ? value * HOUR : value * 60 * 1000;
    found = true;
  }
  if (text.includes("반나절")) {
    total += HALF_DAY;
    found = true;
  }
  return found ? total : null;
}

/** "작업 15분, 전체 30분" 또는 "40분" 을 추정 하나로. */
export function parseEstimate(cell: string): Estimate | null {
  const work = /작업\s*([^,]+)/.exec(cell);
  const lead = /전체\s*([^,]+)/.exec(cell);
  if (work || lead) {
    const work_ms = work ? parseDuration(work[1]) : null;
    if (work_ms === null) {
      return null;
    }
    return { work_ms, lead_ms: lead ? parseDuration(lead[1]) : null };
  }
  const work_ms = parseDuration(cell);
  return work_ms === null ? null : { work_ms, lead_ms: null };
}

/** PRD 본문의 `## 추정` 표에서 세 값을 읽는다. 표가 없거나 셋이 다 없으면 null. */
export function parseEstimateSection(body: string): EstimateRow | null {
  const section = /^## 추정\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
  if (!section) {
    return null;
  }
  const found: Partial<EstimateRow> = {};
  for (const line of section[1].split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const key = cells[1] === undefined ? undefined : LABELS[cells[1]];
    if (key === undefined || cells[2] === undefined) {
      continue;
    }
    const estimate = parseEstimate(cells[2]);
    if (estimate) {
      found[key] = estimate;
    }
  }
  return found.optimistic && found.realistic && found.pessimistic ? (found as EstimateRow) : null;
}

export type Comparison = {
  issue: number;
  title: string;
  estimate: EstimateRow;
  actual_work_ms: number;
  actual_lead_ms: number;
  /** 실측 작업 합계 ÷ 현실 추정. 1 이면 맞춘 것, 0.2 면 다섯 배 부풀린 것. */
  work_ratio: number;
  /** 실측 전체 ÷ 현실 추정의 전체(없으면 작업 합계). */
  lead_ratio: number;
  /** 작업 합계가 낙관~비관 안에 들었는가. */
  verdict: "안" | "낙관보다 짧음" | "비관 초과";
};

export function compare(outcome: Outcome, estimate: EstimateRow): Comparison {
  const realisticLead = estimate.realistic.lead_ms ?? estimate.realistic.work_ms;
  const work = outcome.active_ms;
  const verdict =
    work < estimate.optimistic.work_ms ? "낙관보다 짧음" : work > estimate.pessimistic.work_ms ? "비관 초과" : "안";
  return {
    issue: outcome.issue,
    title: outcome.title,
    estimate,
    actual_work_ms: work,
    actual_lead_ms: outcome.lead_time_ms,
    work_ratio: work / estimate.realistic.work_ms,
    lead_ratio: outcome.lead_time_ms / realisticLead,
    verdict,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type Summary = {
  count: number;
  work_ratio_median: number | null;
  lead_ratio_median: number | null;
  inside: number;
  under: number;
  over: number;
};

export function summarize(rows: Comparison[]): Summary {
  return {
    count: rows.length,
    work_ratio_median: median(rows.map((row) => row.work_ratio)),
    lead_ratio_median: median(rows.map((row) => row.lead_ratio)),
    inside: rows.filter((row) => row.verdict === "안").length,
    under: rows.filter((row) => row.verdict === "낙관보다 짧음").length,
    over: rows.filter((row) => row.verdict === "비관 초과").length,
  };
}

/** 비율을 소수 둘째 자리로. null 은 "—". */
export function formatRatio(ratio: number | null): string {
  return ratio === null ? "—" : ratio.toFixed(2);
}
