import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compare,
  formatRatio,
  parseDuration,
  parseEstimate,
  parseEstimateSection,
  phasesOf,
  summarize,
} from "./estimate.ts";
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
  assert.deepEqual(parseEstimate("작업 15분, 전체 30분"), { work_ms: 15 * MIN, lead_ms: 30 * MIN, write_ms: null });
  assert.deepEqual(parseEstimate("40분"), { work_ms: 40 * MIN, lead_ms: null, write_ms: null });
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

test("추정 셀의 작성을 읽고, 없으면 null", () => {
  assert.deepEqual(parseEstimate("작업 8분, 전체 20분, 작성 30분"), {
    work_ms: 8 * MIN,
    lead_ms: 20 * MIN,
    write_ms: 30 * MIN,
  });
  assert.equal(parseEstimate("작업 8분, 전체 20분")?.write_ms, null);
  assert.equal(parseEstimate("40분")?.write_ms, null);
});

const timed = (times: { drafted_at: string | null; submitted_at: string | null; approved_at: string | null }) =>
  ({ ...outcome(30, 50), prd_times: times }) as Outcome;

test("이슈마다 작성·승인 대기·구현 세 구간을 센다", () => {
  const full = phasesOf(
    timed({
      drafted_at: "2026-10-23T01:00:00Z",
      submitted_at: "2026-10-23T01:40:00Z",
      approved_at: "2026-10-23T02:00:00Z",
    }),
  );
  assert.deepEqual(full, { write_ms: 40 * MIN, wait_ms: 20 * MIN, build_ms: 50 * MIN });
  // 초안 없이 바로 승인돼 올라간 PRD: 작성은 drafted_at→approved_at, 승인 대기는 없다.
  const direct = phasesOf(
    timed({ drafted_at: "2026-10-23T01:00:00Z", submitted_at: null, approved_at: "2026-10-23T01:25:00Z" }),
  );
  assert.deepEqual(direct, { write_ms: 25 * MIN, wait_ms: null, build_ms: 50 * MIN });
  // 칸이 없는 옛 행.
  assert.deepEqual(phasesOf(outcome(30, 50)), { write_ms: null, wait_ms: null, build_ms: 50 * MIN });
});

const WRITE_BODY = BODY.replace("| 현실 | 작업 25분, 전체 45분 |", "| 현실 | 작업 25분, 전체 45분, 작성 20분 |");

test("작성 실측을 현실 작성 추정과 맞대고 중앙값을 낸다. 어느 쪽이 없으면 null", () => {
  const withWrite = parseEstimateSection(WRITE_BODY);
  const without = parseEstimateSection(BODY);
  assert.ok(withWrite && without);
  const at = (minutes: number) => ({
    drafted_at: "2026-10-23T01:00:00Z",
    submitted_at: new Date(Date.parse("2026-10-23T01:00:00Z") + minutes * MIN).toISOString(),
    approved_at: null,
  });
  const a = compare(timed(at(30)), withWrite);
  assert.equal(a.write_ms, 30 * MIN);
  assert.equal(a.write_ratio, 30 / 20);
  const b = compare(timed(at(10)), withWrite);
  assert.equal(b.write_ratio, 10 / 20);
  assert.equal(compare(outcome(30, 50), withWrite).write_ratio, null);
  assert.equal(compare(timed(at(30)), without).write_ratio, null);
  const old = compare(outcome(30, 50), without);
  assert.equal(old.work_ratio, 30 / 25);
  assert.equal(old.write_ms, null);
  assert.equal(old.wait_ms, null);
  assert.equal(summarize([a, b, old]).write_ratio_median, (30 / 20 + 10 / 20) / 2);
  assert.equal(summarize([old]).write_ratio_median, null);
  assert.equal(formatRatio(summarize([old]).write_ratio_median), "—");
});
