import assert from "node:assert/strict";
import { test } from "node:test";

import type { TurnAnalysisResponse, TurnTrace } from "./client.ts";
import type { RunResult, TurnRecord } from "./runner.ts";
import { blocksText, decisionText, hasTrace, traceCell, traceMarkdown, traceOf } from "./trace.ts";

// 지어낸 추적이다. 모양은 PRD #37 의 설계(서버의 TurnAnalysisResponse.trace)를 따른다.
const fullTrace: TurnTrace = {
  promptVersion: "0.4.0",
  blocks: [
    { name: "identity", chars: 320 },
    { name: "pet", chars: 80 },
    { name: "turn_style", chars: 140 },
  ],
  turnStyle: {
    questionPolicy: "forbid",
    reassureCooldown: true,
    endingAvoid: "요",
    stockPassed: ["천천히"],
    judgeLine: false,
    shortRule: true,
    actionRule: ["feelingGuess", "permission"],
  },
  systemPrompt: "You are a quiet companion.\n```\ninner fence\n```",
};

function analysis(trace?: TurnTrace | null): TurnAnalysisResponse {
  return {
    at: "2026-10-22T00:00:00.000Z",
    task: 1,
    phase: "task",
    risk: { level: 0, detectedBy: "none" },
    transition: { from: 1, to: 1, advanced: false, retryCount: 0 },
    knowledge: [],
    ...(trace === undefined ? {} : { trace }),
  };
}

const turn = (index: number): TurnRecord => ({
  index,
  user: `발화 ${index}`,
  answer: `답 ${index}`,
  task: 1,
  progress: 0,
  supportLevel: 1,
  done: false,
  latencyMs: 1000,
  firstTokenMs: null,
  flags: [],
});

function runWith(analyses: TurnAnalysisResponse[], turns = 2): RunResult {
  return {
    persona: { name: "p", situation: "지어낸 인물", language: "ko", profile: null, turns: [] },
    sessionId: "chat-eval-p-0000",
    startedAt: "2026-10-22T00:00:00.000Z",
    greeting: "안녕하세요.",
    greetingLatencyMs: 1000,
    turns: Array.from({ length: turns }, (_, i) => turn(i + 1)),
    closed: true,
    closedBy: "script",
    sessionFlags: [],
    state: { sessionId: "s", task: 1, progress: 0, supportLevel: 1, closed: true, reportAvailable: false },
    messages: [],
    analysis: { sessionId: "s", closed: true, analyses, history: [] },
    report: null,
  };
}

test("blocksText, decisionText: 블록 이름·길이와 화법 결정 한 줄", () => {
  assert.equal(blocksText(fullTrace), "identity 320, pet 80, turn_style 140");
  assert.equal(
    decisionText(fullTrace),
    '질문 forbid · 위로 쉼 · 어미 피함 "요" · 상투구 넘김 천천히 · 짧은 말 · 넘김 feelingGuess, permission',
  );
  assert.equal(decisionText({ turnStyle: { questionPolicy: "allow", stockPassed: [], actionRule: [] } }), "질문 allow");
});

test("칸이 빠진 추적도 던지지 않는다", () => {
  assert.equal(blocksText({}), "-");
  assert.equal(decisionText({}), "-");
  assert.equal(traceCell(runWith([analysis({})], 1), 1), "-\n-");
});

test("traceOf, hasTrace: 분석 항목을 턴 순서로 맞추고, 칸이 없거나 null 이면 없다", () => {
  const run = runWith([analysis(), analysis(fullTrace)]);
  assert.equal(traceOf(run, 1), undefined);
  assert.equal(traceOf(run, 2)?.promptVersion, "0.4.0");
  assert.equal(traceOf(run, 3), undefined);
  assert.ok(hasTrace(run));
  // production 과 옛 서버: 칸이 없다.
  assert.equal(hasTrace(runWith([analysis(), analysis()])), false);
  assert.equal(hasTrace(runWith([analysis(null)], 1)), false);
  assert.equal(hasTrace(runWith([])), false);
});

test("traceCell: 버전, 블록, 결정 세 줄. 추적이 없는 턴은 -", () => {
  const run = runWith([analysis(fullTrace), analysis()]);
  assert.equal(traceCell(run, 1).split("\n")[0], "v0.4.0");
  assert.equal(traceCell(run, 1).split("\n")[1], "identity 320, pet 80, turn_style 140");
  assert.equal(traceCell(run, 2), "-");
});

test("traceMarkdown: 턴마다 블록, 결정, 시스템 프롬프트 전문. 추적이 없으면 null", () => {
  assert.equal(traceMarkdown(runWith([analysis(), analysis()])), null);
  const md = traceMarkdown(runWith([analysis(fullTrace), analysis()])) ?? "";
  assert.match(md, /^# p — 턴 추적/);
  assert.match(
    md,
    /## 턴 1\n\n- 프롬프트 버전: 0\.4\.0\n- 블록: identity 320, pet 80, turn_style 140\n- 화법 결정: 질문 forbid/,
  );
  // 본문의 백틱 울타리보다 긴 울타리로 감싼다.
  assert.match(md, /````text\nYou are a quiet companion\.\n```\ninner fence\n```\n````/);
  assert.match(md, /## 턴 2\n\n추적 없음/);
});
