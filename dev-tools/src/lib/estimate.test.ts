import assert from "node:assert/strict";
import { test } from "node:test";

import { compare, parseDuration, parseEstimate, parseEstimateSection, summarize } from "./estimate.ts";
import type { Outcome } from "./ledger.ts";

const MIN = 60 * 1000;

test("기간 글을 분 단위 밀리초로 읽는다", () => {
  assert.equal(parseDuration("40분"), 40 * MIN);
  assert.equal(parseDuration("1시간 30분"), 90 * MIN);
  assert.equal(parseDuration("1.5시간"), 90 * MIN);
  assert.equal(parseDuration("반나절"), 240 * MIN);
  assert.equal(parseDuration("1일"), 480 * MIN);
  assert.equal(parseDuration("감으로"), null);
});

test("작업과 전체를 따로 적은 추정과 하나만 적은 추정", () => {
  assert.deepEqual(parseEstimate("작업 15분, 전체 30분"), { work_ms: 15 * MIN, lead_ms: 30 * MIN });
  assert.deepEqual(parseEstimate("40분"), { work_ms: 40 * MIN, lead_ms: null });
  assert.equal(parseEstimate("실측 표본 없음"), null);
});

const BODY = `## 요약

글.

## 추정

| 구분 | 값 | 근거 |
|---|---|---|
| 낙관 | 작업 10분, 전체 15분 | #9 |
| 현실 | 작업 25분, 전체 45분 | 표본 4 |
| 비관 | 작업 1시간, 전체 2시간 | |

## 사람이 할 일
`;

test("추정 표에서 세 값을 읽고, 없으면 null", () => {
  const row = parseEstimateSection(BODY);
  assert.ok(row);
  assert.equal(row.realistic.work_ms, 25 * MIN);
  assert.equal(row.pessimistic.lead_ms, 120 * MIN);
  assert.equal(parseEstimateSection("## 요약\n\n글.\n"), null);
  assert.equal(parseEstimateSection("## 추정\n\n| 구분 | 값 |\n|---|---|\n| 낙관 | 10분 |\n"), null);
});

const outcome = (active: number, lead: number): Outcome =>
  ({ issue: 50, title: "t", finished_at: "", active_ms: active * MIN, lead_time_ms: lead * MIN, tasks: [] }) as Outcome;

test("실측을 현실 추정과 맞대고 낙관~비관 안인지 가른다", () => {
  const row = parseEstimateSection(BODY);
  assert.ok(row);
  const inside = compare(outcome(30, 50), row);
  assert.equal(inside.verdict, "안");
  assert.equal(inside.work_ratio, 30 / 25);
  assert.equal(inside.lead_ratio, 50 / 45);
  assert.equal(compare(outcome(5, 10), row).verdict, "낙관보다 짧음");
  assert.equal(compare(outcome(90, 100), row).verdict, "비관 초과");
  const summary = summarize([inside, compare(outcome(5, 10), row), compare(outcome(90, 100), row)]);
  assert.equal(summary.count, 3);
  assert.equal(summary.inside, 1);
  assert.equal(summary.under, 1);
  assert.equal(summary.over, 1);
  assert.equal(summary.work_ratio_median, 30 / 25);
});
