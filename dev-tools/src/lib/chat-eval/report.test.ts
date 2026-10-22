import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Persona } from "./persona.ts";
import {
  CHAT_EVAL_USAGE,
  cell,
  chatEvalDir,
  checkCounts,
  genericText,
  loadRuns,
  localDate,
  minTaskShortfall,
  parseChatEvalArgs,
  personaMarkdown,
  readBaseline,
  reassureText,
  runGenericRate,
  type SavedRun,
  saveRun,
  summaryMarkdown,
  turnLine,
  writeSummary,
} from "./report.ts";
import type { TurnRecord } from "./runner.ts";

// 지어낸 인물과 지어낸 대화다.
const persona = (name: string, expect?: Persona["expect"]): Persona => ({
  name,
  situation: "지어낸 인물: 고양이 단추",
  language: "ko",
  profile: { griefPath: "afterLoss", petName: "단추" },
  turns: ["단추가 보고 싶어요", "그만할래요"],
  ...(expect === undefined ? {} : { expect }),
});

const turn = (index: number, overrides: Partial<TurnRecord> = {}): TurnRecord => ({
  index,
  user: `발화 ${index}`,
  answer: `답 ${index}`,
  task: 1,
  progress: 0.3,
  supportLevel: 1,
  done: false,
  latencyMs: 2000,
  firstTokenMs: null,
  flags: [],
  ...overrides,
});

function run(name: string, overrides: Partial<SavedRun> = {}): SavedRun {
  return {
    persona: persona(name),
    sessionId: `chat-eval-${name}-0000`,
    startedAt: "2026-10-17T03:00:00.000Z",
    greeting: "안녕하세요.\n단추 이야기를 들려주세요.",
    greetingLatencyMs: 1500,
    turns: [turn(1), turn(2)],
    closed: true,
    closedBy: "script",
    sessionFlags: [],
    state: { sessionId: "s", task: 1, progress: 0.3, supportLevel: 1, closed: true, reportAvailable: false },
    messages: [],
    analysis: { sessionId: "s", closed: true, analyses: [], history: [] },
    report: null,
    baseUrl: "http://127.0.0.1:3000",
    ...overrides,
  };
}

test("parseChatEvalArgs: 인자 없음과 --help 는 사용법(null)", () => {
  assert.equal(parseChatEvalArgs([]), null);
  assert.equal(parseChatEvalArgs(["--help"]), null);
  assert.equal(parseChatEvalArgs(["run", "--all", "-h"]), null);
});

test("parseChatEvalArgs: run 의 선택지를 읽는다", () => {
  assert.deepEqual(parseChatEvalArgs(["run", "--persona", "teen-hamster", "--stream"]), {
    persona: "teen-hamster",
    interactive: false,
    stream: true,
    baseline: null,
  });
  assert.deepEqual(parseChatEvalArgs(["run", "--all", "--interactive", "--baseline", "2026-10-17"]), {
    persona: null,
    interactive: true,
    stream: false,
    baseline: "2026-10-17",
  });
});

test("parseChatEvalArgs: 틀린 인자는 사용법을 담아 던진다", () => {
  const usage = new RegExp(CHAT_EVAL_USAGE.slice(0, 10));
  assert.throws(() => parseChatEvalArgs(["go", "--all"]), /모르는 하위 명령/);
  assert.throws(() => parseChatEvalArgs(["run"]), /하나만/);
  assert.throws(() => parseChatEvalArgs(["run", "--all", "--persona", "x"]), /하나만/);
  assert.throws(() => parseChatEvalArgs(["run", "--persona"]), /값이 없습니다/);
  assert.throws(() => parseChatEvalArgs(["run", "--all", "--baseline", "어제"]), /YYYY-MM-DD/);
  assert.throws(() => parseChatEvalArgs(["run", "--all", "--fast"]), usage);
});

test("turnLine: 과제, 수준, 지연, 첫 토큰, 검사 이름을 한 줄에", () => {
  const line = turnLine(
    turn(3, {
      firstTokenMs: 400,
      latencyMs: 2800,
      done: true,
      flags: [{ check: "byteToken", level: "error", detail: "x" }],
      answer: "첫 줄\n둘째 줄",
    }),
    false,
  );
  assert.match(
    line,
    /턴 3 {2}과제 1 {2}진행 0.3 {2}수준 1 {2}done true {2}2.8s \(첫 토큰 0.4s\) {2}검사 \[byteToken\]/,
  );
  assert.match(line, /↳ 첫 줄 둘째 줄/);
  assert.match(turnLine(turn(1), true), /\n답 1$/);
});

test("checkCounts: 턴과 세션의 표시를 검사마다 센다", () => {
  const counts = checkCounts(
    run("a", {
      turns: [
        turn(1, { flags: [{ check: "multiQuestion", level: "warn", detail: "" }] }),
        turn(2, {
          flags: [
            { check: "multiQuestion", level: "warn", detail: "" },
            { check: "byteToken", level: "error", detail: "" },
          ],
        }),
      ],
      sessionFlags: [{ check: "formulaicTail", level: "warn", detail: "" }],
    }),
  );
  assert.deepEqual(counts, {
    byteToken: 1,
    forbiddenWord: 0,
    languageMismatch: 0,
    multiQuestion: 2,
    formulaicTail: 1,
    crisisExpectation: 0,
    stockRepeat: 0,
    echoOpening: 0,
    pronounFlip: 0,
  });
});

test("cell: 표를 깨는 글을 가린다", () => {
  assert.equal(cell("a | b\nc"), "a \\| b<br>c");
});

test("personaMarkdown: 머리, 턴 표, 세션 검사, 리포트 없음, 분석 없음, 판정 칸", () => {
  const md = personaMarkdown(
    run("elderly", {
      turns: [
        turn(1, { user: "그만 | 할래", flags: [{ check: "crisisExpectation", level: "error", detail: "오탐" }] }),
      ],
      sessionFlags: [{ check: "formulaicTail", level: "warn", detail: "3/3" }],
    }),
  );
  assert.match(md, /^# elderly — 대화 실측/);
  assert.match(md, /\| 세션 \| chat-eval-elderly-0000 \|/);
  assert.match(md, /\| closedBy \| script \(closed true\) \|/);
  assert.match(md, /\| 서버 \| http:\/\/127.0.0.1:3000 \|/);
  assert.match(md, /> 단추 이야기를 들려주세요\./);
  assert.match(
    md,
    /\| 1 \| 그만 \\\| 할래 \| 답 1 \| 과제 1 · 수준 1 · 진행 0.3 \| crisisExpectation\(error\): 오탐 \| 2.0s \|/,
  );
  assert.match(md, /## 세션 검사\n\n- formulaicTail\(warn\): 3\/3/);
  assert.match(md, /리포트 없음/);
  assert.match(md, /분석 없음/);
  assert.match(md, /\| # \| 판정 \| 사유 \|\n\|---\|---\|---\|\n\| 1 \| {2}\| {2}\|/);
  assert.doesNotMatch(md, /minTask/);
});

test("personaMarkdown: 리포트 절과 분석 표, minTask 미달", () => {
  const md = personaMarkdown(
    run("p", {
      persona: persona("p", { minTask: 3 }),
      state: { sessionId: "s", task: 2, progress: 0.5, supportLevel: 1, closed: true, reportAvailable: true },
      report: {
        at: "t",
        startedAt: "t",
        petName: "단추",
        reachedTask: 2,
        progress: 0.5,
        locale: "ko",
        sections: [{ key: "journey", body: "창가의 단추", tags: ["창가"] }],
      },
      analysis: {
        sessionId: "s",
        closed: true,
        history: [],
        analyses: [
          {
            at: "2026-10-17T03:00:01Z",
            task: 1,
            phase: "task",
            risk: { level: 1, detectedBy: "none" },
            transition: { from: 1, to: 2, advanced: true, retryCount: 0 },
            knowledge: [],
          },
        ],
      },
    }),
  );
  assert.match(md, /\| 도달 과제 \| 2 — minTask 미달: 도달 과제 2 < 3 \|/);
  assert.match(md, /> ⚠ minTask 미달/);
  assert.match(md, /### journey\n\n창가의 단추\n\n태그: 창가/);
  assert.match(md, /\| 1 \| 2026-10-17T03:00:01Z \| 1 \| task \| 1 \(none\) \| 1→2 전이, retry 0 \|/);
});

test("minTaskShortfall: 기대가 없거나 도달했으면 null", () => {
  assert.equal(minTaskShortfall(run("a")), null);
  assert.equal(minTaskShortfall(run("a", { persona: persona("a", { minTask: 1 }) })), null);
});

test("summaryMarkdown: 인물 × 검사와 인물별 결과", () => {
  const md = summaryMarkdown("2026-10-18", [
    run("b", { turns: [turn(1, { firstTokenMs: 300, latencyMs: 1000 }), turn(2, { latencyMs: 3000 })] }),
    run("a", { sessionFlags: [{ check: "formulaicTail", level: "warn", detail: "" }] }),
  ]);
  assert.match(md, /^# 대화 실측 요약 \(2026-10-18\)/);
  assert.match(
    md,
    /\| 인물 \| byteToken \| forbiddenWord \| languageMismatch \| multiQuestion \| formulaicTail \| crisisExpectation \| stockRepeat \| echoOpening \| pronounFlip \|\n/,
  );
  // 이름순이다.
  assert.match(
    md,
    /\| a \| 0 \| 0 \| 0 \| 0 \| 1 \| 0 \| 0 \| 0 \| 0 \|\n\| b \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \|/,
  );
  assert.match(
    md,
    /\| 인물 \| 턴 \| closedBy \| 도달 과제 \| 평균 지연 \| 평균 첫 토큰 \| 정상화 위로\(reassureRate\) \| 일반 위로\(genericRate\) \|\n/,
  );
  assert.match(md, /\| b \| 2 \| script \| 1 \| 2.0s \| 0.3s \| 0% \|/);
  assert.match(md, /\| a \| 2 \| script \| 1 \| 2.0s \| - \| 0% \|/);
});

test("summaryMarkdown: 새 세션 검사(stockRepeat, echoOpening)의 표시 수와 정상화 위로 비율", () => {
  const md = summaryMarkdown("2026-10-21", [
    run("a", {
      turns: [
        turn(1, { answer: "그렇게 느끼는 건 자연스러운 일이에요." }),
        turn(2, { answer: "단추와 걷던 길이 떠올라요." }),
        turn(3, { answer: "당연히 그리우시겠죠." }),
        turn(4, { answer: "그 길은 어땠나요?" }),
      ],
      sessionFlags: [
        { check: "stockRepeat", level: "warn", detail: "턴 3: 천천히" },
        { check: "echoOpening", level: "warn", detail: "턴 2" },
        { check: "echoOpening", level: "warn", detail: "턴 4" },
      ],
    }),
  ]);
  assert.match(md, /\| a \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 1 \| 2 \| 0 \|\n/);
  assert.match(md, /\| a \| 4 \| script \| 1 \| 2.0s \| - \| 50% \|/);
});

test("reassureText: 답이 없으면 -", () => {
  assert.equal(reassureText(run("a", { turns: [] })), "-");
  assert.equal(reassureText(run("a", { turns: [turn(1, { answer: "It's normal to miss her." })] })), "100%");
});

test("summaryMarkdown: 기준이 있으면 칸이 `기준 → 지금`, 한쪽만 있는 인물은 -", () => {
  const before = run("a", { turns: [turn(1, { flags: [{ check: "byteToken", level: "error", detail: "" }] })] });
  const md = summaryMarkdown("2026-10-18", [run("a"), run("c")], {
    date: "2026-10-17",
    runs: [before, run("z")],
  });
  assert.match(md, /기준 2026-10-17 → 지금 2026-10-18/);
  assert.match(md, /\| a \| 1 → 0 \| 0 → 0 \|/);
  assert.match(md, /\| c \| - → 0 \|/);
  assert.match(md, /\| z \| 0 → - \|/);
  assert.match(md, /\| a \| 1 → 2 \| script → script \|/);
});

// 지어낸 분석 항목. 라벨 칸은 판정기가 돈 턴에만 있다(#27).
const analysisItem = (
  label?: "generic_comfort" | "specific_reflection" | "question",
  extra: { replyLabelProbability?: number; replyJudge?: string } = {},
) => ({
  at: "2026-10-21T03:00:01Z",
  task: 1,
  phase: "task" as const,
  risk: { level: 1, detectedBy: "none" as const },
  transition: { from: 1, to: 1, advanced: false, retryCount: 0 },
  knowledge: [],
  ...(label === undefined ? {} : { replyLabel: label }),
  ...extra,
});

const labeled = (name: string, labels: ("generic_comfort" | "specific_reflection" | "question" | undefined)[]) =>
  run(name, {
    analysis: { sessionId: "s", closed: true, history: [], analyses: labels.map((label) => analysisItem(label)) },
  });

test("runGenericRate, genericText: 분석 항목의 replyLabel 로 세고, 라벨이 없으면 null 과 -", () => {
  const r = labeled("a", ["generic_comfort", undefined, "specific_reflection", "generic_comfort", "question"]);
  assert.equal(runGenericRate(r), 0.5);
  assert.equal(genericText(r), "50%");
  assert.equal(runGenericRate(labeled("a", [undefined, undefined])), null);
  assert.equal(genericText(labeled("a", [undefined])), "-");
  assert.equal(genericText(run("a")), "-");
});

test("summaryMarkdown: 인물별 결과의 끝 칸이 genericRate, 기준이 없으면 차이 절이 없다", () => {
  const md = summaryMarkdown("2026-10-21", [labeled("a", ["generic_comfort", "question", "question", "question"])]);
  assert.match(md, /\| a \| 2 \| script \| 1 \| 2.0s \| - \| 0% \| 25% \|\n/);
  assert.doesNotMatch(md, /기준 대비 차이/);
  const none = summaryMarkdown("2026-10-21", [run("b")]);
  assert.match(none, /\| b \| 2 \| script \| 1 \| 2.0s \| - \| 0% \| - \|\n/);
});

test("summaryMarkdown: 기준이 있으면 genericRate 는 `기준 → 지금`, 차이 절에 평균 지연과 genericRate 의 차이", () => {
  const before = labeled("a", ["generic_comfort", "generic_comfort", "question", "question"]);
  const now = {
    ...labeled("a", ["generic_comfort", "question", "question", "question"]),
    turns: [turn(1, { latencyMs: 2500 }), turn(2, { latencyMs: 3500 })],
  };
  const md = summaryMarkdown("2026-10-21", [now, run("c")], { date: "2026-10-20", runs: [before, run("z")] });
  assert.match(md, /\| a \| 2 → 2 \| script → script \| 1 → 1 \| 2.0s → 3.0s \| - → - \| 0% → 0% \| 50% → 25% \|\n/);
  assert.match(md, /## 기준 대비 차이 \(지금 − 기준\)/);
  assert.match(md, /\| 인물 \| 평균 지연 차이 \| 일반 위로\(genericRate\) 차이 \|\n/);
  assert.match(md, /\| a \| \+1.0s \| -25%p \|\n/);
  // 한쪽에만 있는 인물과 라벨이 없는 쪽은 -.
  assert.match(md, /\| c \| - \| - \|\n/);
  assert.match(md, /\| z \| - \| - \|\n/);
});

test("personaMarkdown: 분석 표의 replyLabel 칸, 확률과 판정기를 붙이고 없으면 -", () => {
  const md = personaMarkdown(
    run("p", {
      analysis: {
        sessionId: "s",
        closed: true,
        history: [],
        analyses: [
          analysisItem("generic_comfort", { replyLabelProbability: 0.823, replyJudge: "haiku" }),
          analysisItem(),
        ],
      },
    }),
  );
  assert.match(md, /\| # \| 시각 \| 과제 \| phase \| risk \| transition \| replyLabel \|\n/);
  assert.match(md, /\| 1 \| .* \| generic_comfort 0.82 \(haiku\) \|\n/);
  assert.match(md, /\| 2 \| .* \| 1→1, retry 0 \| - \|\n/);
});

test("localDate: 로컬 날짜", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("chatEvalDir: 기본은 outputs/chat-eval/<날짜>, CHAT_EVAL_OUT 은 outputs/ 아래만", () => {
  assert.equal(chatEvalDir("/r", "2026-10-17", {}), "/r/outputs/chat-eval/2026-10-17");
  assert.equal(chatEvalDir("/r", "2026-10-17", { CHAT_EVAL_OUT: "outputs/trial" }), "/r/outputs/trial/2026-10-17");
  assert.throws(() => chatEvalDir("/r", "2026-10-17", { CHAT_EVAL_OUT: "docs" }), /outputs\/ 아래/);
  assert.throws(() => chatEvalDir("/r", "2026-10-17", { CHAT_EVAL_OUT: "outputs" }), /outputs\/ 아래/);
  assert.throws(() => chatEvalDir("/r", "2026-10-17", { CHAT_EVAL_OUT: "outputs-x" }), /outputs\/ 아래/);
  assert.throws(() => chatEvalDir("/r", "../x", {}), /YYYY-MM-DD/);
});

test("saveRun, loadRuns, writeSummary: 하나씩 돌려도 summary 가 누적되고 다른 json 은 읽지 않는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-eval-"));
  try {
    const day = join(dir, "2026-10-18");
    const md = saveRun(day, run("b"));
    assert.equal(md, join(day, "b.md"));
    assert.match(readFileSync(md, "utf8"), /^# b — 대화 실측/);
    saveRun(day, run("a"));
    writeFileSync(join(day, "p1-00.json"), "{}");
    assert.deepEqual(
      loadRuns(day).map((r) => r.persona.name),
      ["a", "b"],
    );
    const summary = readFileSync(writeSummary(day, "2026-10-18", null), "utf8");
    assert.match(summary, /\| a \|[^\n]*\n\| b \|/);

    // 기준: 폴더가 없으면 던지고, 결과 json 이 없으면 빈 채로. 빈 기준은 summary 에 쓰지 않는다.
    assert.throws(() => readBaseline(join(dir, "2000-01-01"), "2000-01-01"), /폴더가 없습니다/);
    const empty = join(dir, "2026-10-17");
    mkdirSync(empty);
    writeFileSync(join(empty, "p1-00.json"), "{}");
    const baseline = readBaseline(empty, "2026-10-17");
    assert.equal(baseline.runs.length, 0);
    assert.doesNotMatch(readFileSync(writeSummary(day, "2026-10-18", baseline), "utf8"), /→/);
    assert.match(
      readFileSync(writeSummary(day, "2026-10-18", readBaseline(day, "2026-10-18")), "utf8"),
      /\| a \| 0 → 0 \|/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 동작 수치와 턴 추적(#37) ──

const traced = {
  promptVersion: "0.4.0",
  blocks: [
    { name: "identity", chars: 300 },
    { name: "turn_style", chars: 90 },
  ],
  turnStyle: { questionPolicy: "forbid" as const, stockPassed: [], shortRule: true, actionRule: [] },
  systemPrompt: "지어낸 시스템 프롬프트",
};

const movingRun = (name: string, greeting: string, answers: string[]) =>
  run(name, {
    greeting,
    turns: answers.map((answer, i) => turn(i + 1, { answer })),
  });

test("personaMarkdown: 턴 표의 동작 칸과 동작과 길이 절, 추적이 없으면 추적 칸이 없다", () => {
  const md = personaMarkdown(
    movingRun("p", "안녕하세요.", ["많이 무거우시겠어요. 울어도 괜찮아요.", "단추는 어디서 자곤 했나요?"]),
  );
  assert.match(md, /\| # \| 사용자 발화 \| 답 \| 과제·수준 \| 검사 표시 \| 지연 \| 동작 \|\n/);
  assert.match(md, /\| 1 \| 발화 1 \| .* \| 2.0s \| 추정·허락 \|\n/);
  assert.match(md, /\| 2 \| 발화 2 \| .* \| 2.0s \| - \|\n/);
  assert.match(md, /## 동작과 길이/);
  assert.match(md, /\| feelingGuess \(추정\) \| 50% \|/);
  assert.match(md, /\| 셋 중 하나라도 \| 50% \|/);
  assert.match(md, /\| lengthVariance \(답 글자 수, 표준편차\) \| sd \d+자 \/ 평균 \d+자 \|/);
  assert.doesNotMatch(md, /추적/);
});

test("personaMarkdown: 위기 턴은 동작과 길이에서 뺀다", () => {
  const md = personaMarkdown(
    run("p", {
      turns: [
        turn(1, { answer: "단추 이야기를 더 들려주세요." }),
        turn(2, { answer: "혼자 짊어지지 않아도 돼요. 109 로 연락할 수 있어요.", supportLevel: 3, done: true }),
      ],
    }),
  );
  assert.match(md, /\| 셋 중 하나라도 \| 0% \|/);
});

test("personaMarkdown: 분석에 trace 가 있으면 턴 표에 추적 칸, 전문은 trace.md 를 가리킨다", () => {
  const md = personaMarkdown(
    run("p", {
      analysis: {
        sessionId: "s",
        closed: true,
        history: [],
        analyses: [{ ...analysisItem(), trace: traced }, analysisItem()],
      },
    }),
  );
  assert.match(md, /\| # \| 사용자 발화 \| 답 \| 과제·수준 \| 검사 표시 \| 지연 \| 동작 \| 추적 \|\n/);
  assert.match(md, /\| 1 \| .* \| v0\.4\.0<br>identity 300, turn_style 90<br>질문 forbid · 짧은 말 \|\n/);
  assert.match(md, /\| 2 \| .* \| - \| - \|\n/);
  assert.match(md, /`p\.trace\.md` 에 있다/);
  assert.doesNotMatch(md, /지어낸 시스템 프롬프트/);
});

test("summaryMarkdown: 인물별 동작과 길이, 인물 전체 비율, 첫 인사 겹침", () => {
  const md = summaryMarkdown("2026-10-22", [
    movingRun("a", "안녕하세요, 단추를 떠나보내신 마음이 무거우시겠어요.", ["힘드시겠어요.", "단추는 어땠나요?"]),
    movingRun("b", "안녕하세요, 단추를 떠나보내신 마음이 무거우시겠어요.", [
      "울어도 괜찮아요.",
      "그만큼 아꼈다는 증거예요.",
    ]),
    movingRun("c", "오늘 와 주셔서 고마워요.", ["단추 이야기를 들려주세요.", "그랬군요."]),
  ]);
  assert.match(
    md,
    /\| 인물 \| 감정 추정\(feelingGuess\) \| 뜻 부여\(meaningGiven\) \| 허락\(permission\) \| 셋 중 하나라도 \| 답 길이\(lengthVariance\) \|\n/,
  );
  assert.match(md, /\| a \| 50% \| 0% \| 0% \| 50% \| sd \d+자 \/ 평균 \d+자 \|\n/);
  assert.match(md, /\| b \| 0% \| 50% \| 50% \| 100% \|/);
  assert.match(md, /동작 셋 중 하나라도 담긴 턴, 인물 전체\(위기 턴 제외\): 3\/6 \(50%\)/);
  assert.match(
    md,
    /## 첫 인사 겹침 \(greetingOverlap\)\n\n.*: 2\/3\n\n- 문장: 안녕하세요, 단추를 떠나보내신 마음이 무거우시겠어요\.\n- 인물: a, b/,
  );
  assert.doesNotMatch(md, /기준 대비 동작 차이/);
});

test("summaryMarkdown: 기준이 있으면 동작·길이·첫 인사가 `기준 → 지금`, 동작 차이 절이 있다", () => {
  const before = [
    movingRun("a", "안녕하세요, 단추를 떠나보내신 마음이 무거우시겠어요.", ["힘드시겠어요.", "울어도 괜찮아요."]),
    movingRun("b", "안녕하세요, 단추를 떠나보내신 마음이 무거우시겠어요.", ["힘드시겠어요.", "가".repeat(20)]),
  ];
  const now = [
    movingRun("a", "단추 이야기를 들려주세요.", ["힘드시겠어요.", "단추는 어땠나요?"]),
    movingRun("b", "오늘 와 주셔서 고마워요.", ["그랬군요.", "가".repeat(20)]),
  ];
  const md = summaryMarkdown("2026-10-23", now, { date: "2026-10-22", runs: before });
  assert.match(md, /\| a \| 50% → 50% \| 0% → 0% \| 50% → 0% \| 100% → 50% \|/);
  assert.match(md, /인물 전체\(위기 턴 제외\): 3\/4 \(75%\) → 1\/4 \(25%\)/);
  assert.match(md, /: 2\/2 → 1\/2\n/);
  assert.match(md, /## 기준 대비 동작 차이 \(지금 − 기준\)/);
  assert.match(md, /\| 인물 \| 동작 셋 중 하나라도 차이 \| 답 길이 표준편차 차이 \|\n/);
  assert.match(md, /\| a \| -50%p \| [+-]?\d+자 \|\n/);
  assert.match(md, /\| b \| -50%p \| [+-]?\d+자 \|\n/);
});

test("saveRun: 추적이 있으면 <인물>.trace.md 를 따로 쓰고, 없으면 쓰지 않는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-eval-trace-"));
  try {
    saveRun(dir, run("plain"));
    assert.throws(() => readFileSync(join(dir, "plain.trace.md"), "utf8"));
    const md = saveRun(
      dir,
      run("traced", {
        analysis: { sessionId: "s", closed: true, history: [], analyses: [{ ...analysisItem(), trace: traced }] },
      }),
    );
    const trace = readFileSync(join(dir, "traced.trace.md"), "utf8");
    assert.match(trace, /^# traced — 턴 추적/);
    assert.match(trace, /지어낸 시스템 프롬프트/);
    assert.doesNotMatch(readFileSync(md, "utf8"), /지어낸 시스템 프롬프트/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
