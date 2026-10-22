// 대화 실측의 보고서 작성기와 `pnpm chat:eval` 의 인자·출력 모양.
//
// - 인물 하나의 결과는 날짜 폴더에 `<인물>.run.json`(실행 결과 그대로 + 서버 주소)과 `<인물>.md` 로 남긴다.
//   `summary.md` 는 그 폴더의 `.run.json` 을 모두 읽어 다시 만들므로, `--persona` 로 하나씩 돌려도 누적된다.
//   이름 끝을 `.run.json` 으로 둔 것은 손으로 만든 실측 폴더(2026-10-17 의 `p1-00.json` 등)와 섞이지 않게 하려는 것이다.
// - `--baseline <날짜>` 는 그 날짜 폴더의 `.run.json` 만 읽는다. 사람이 고친 summary.md 를 다시 읽지 않는다.
// - 파일은 `outputs/` 아래에만 쓴다. 비밀번호는 실행 결과에 들어 있지 않고 여기서도 다루지 않는다.
// - 마크다운을 만드는 함수는 순수하고, 파일을 읽고 쓰는 함수는 따로 둔다.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { type CheckId, type Flag, genericRate, type ReplyLabel, reassureRate } from "./checks.ts";
import type { TurnAnalysisResponse } from "./client.ts";
import { cell, percent, table } from "./markdown.ts";
import {
  greetingSection,
  moveCell,
  moveSection,
  movesTotalText,
  runLengthSpread,
  runMoveRates,
} from "./move-report.ts";
import { lengthSpreadText, MOVE_IDS } from "./moves.ts";
import type { RunResult, TurnRecord } from "./runner.ts";
import { hasTrace, traceCell, traceMarkdown } from "./trace.ts";

/** 저장하는 실행 결과. 머리에 쓸 서버 주소를 더한다. */
export type SavedRun = RunResult & { baseUrl: string };

export type Baseline = { date: string; runs: SavedRun[] };

export const CHECK_IDS: readonly CheckId[] = [
  "byteToken",
  "forbiddenWord",
  "languageMismatch",
  "multiQuestion",
  "formulaicTail",
  "crisisExpectation",
  "stockRepeat",
  "echoOpening",
  "pronounFlip",
];

const RUN_SUFFIX = ".run.json";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CHAT_EVAL_USAGE = `사용법: pnpm chat:eval run (--persona <이름> | --all) [--interactive] [--stream] [--baseline <YYYY-MM-DD>]
       pnpm chat:eval arc --arc <이름> [--stream] [--out-label <라벨>] [--reset-qa]   (장기기억, arc --help)

  --persona <이름>     dev-tools/chat-eval/personas/<이름>.json 하나를 돌린다
  --all                인물 파일을 모두 이름순으로 돌린다
  --interactive        대화 모드: 답을 보여 주고 다음 발화를 표준 입력에서 한 줄씩 받는다(/close 로 끝)
  --stream             스트림 경로로 받아 첫 토큰 지연을 잰다
  --baseline <날짜>    outputs/chat-eval/<날짜>/ 의 결과와 summary.md 에 나란히 둔다

결과: outputs/chat-eval/<오늘>/<인물>.md, <인물>.run.json, summary.md
환경 변수: CHAT_EVAL_API(기본 http://127.0.0.1:3000), CHAT_EVAL_OUT(기본 outputs/chat-eval, outputs/ 아래만)`;

export type ChatEvalArgs = {
  /** null 이면 `--all`. */
  persona: string | null;
  interactive: boolean;
  stream: boolean;
  baseline: string | null;
};

const FLAGS = ["--all", "--interactive", "--stream", "--help", "-h"];
const VALUED = ["--persona", "--baseline"];

/** `chat:eval` 의 인자를 읽는다. 사용법을 찍을 때(인자 없음, `--help`)는 null. 틀리면 사용법을 담아 던진다. */
export function parseChatEvalArgs(args: string[]): ChatEvalArgs | null {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return null;
  const fail = (reason: string): never => {
    throw new Error(`${reason}\n${CHAT_EVAL_USAGE}`);
  };
  const [command, ...rest] = args;
  if (command !== "run") fail(`모르는 하위 명령입니다: ${command}`);
  const values: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (VALUED.includes(arg)) {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) fail(`${arg} 에 값이 없습니다`);
      values[arg] = value as string;
    } else if (!FLAGS.includes(arg)) {
      fail(`모르는 인자입니다: ${arg}`);
    }
  }
  const all = rest.includes("--all");
  const persona = values["--persona"] ?? null;
  if (all === (persona !== null)) fail("--persona <이름> 과 --all 중 하나만 줍니다");
  const baseline = values["--baseline"] ?? null;
  if (baseline !== null && !DATE.test(baseline)) fail(`--baseline 은 YYYY-MM-DD 입니다: ${baseline}`);
  return { persona, interactive: rest.includes("--interactive"), stream: rest.includes("--stream"), baseline };
}

// ── 터미널 한 줄 ──

const seconds = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`);

function latencyText(latencyMs: number, firstTokenMs: number | null): string {
  return firstTokenMs === null ? seconds(latencyMs) : `${seconds(latencyMs)} (첫 토큰 ${seconds(firstTokenMs)})`;
}

const flagNames = (flags: Flag[]): string => (flags.length === 0 ? "-" : flags.map((f) => f.check).join(", "));

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 턴 하나의 터미널 출력. `full` 이면(대화 모드) 답 본문을 전부, 아니면 한 줄로 줄여 붙인다. */
export function turnLine(turn: TurnRecord, full: boolean): string {
  const head = `  턴 ${turn.index}  과제 ${turn.task ?? "-"}  진행 ${turn.progress}  수준 ${turn.supportLevel}  done ${turn.done}  ${latencyText(turn.latencyMs, turn.firstTokenMs)}  검사 [${flagNames(turn.flags)}]`;
  return full ? `${head}\n${turn.answer}` : `${head}\n    ↳ ${oneLine(turn.answer, 100)}`;
}

// ── 계산 ──

/** 턴과 세션의 검사 표시를 검사마다 센다. */
export function checkCounts(run: RunResult): Record<CheckId, number> {
  const counts = Object.fromEntries(CHECK_IDS.map((id) => [id, 0])) as Record<CheckId, number>;
  for (const flag of [...run.turns.flatMap((turn) => turn.flags), ...run.sessionFlags]) counts[flag.check] += 1;
  return counts;
}

/** 도달 과제: 턴 응답과 마지막 상태의 과제 가운데 가장 큰 것. */
export function reachedTask(run: RunResult): number {
  return Math.max(run.state.task, ...run.turns.map((turn) => turn.task ?? 0));
}

export function highestSupportLevel(run: RunResult): number {
  return Math.max(run.state.supportLevel, ...run.turns.map((turn) => turn.supportLevel));
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function averageLatency(run: RunResult): number | null {
  return average(run.turns.map((turn) => turn.latencyMs));
}

export function averageFirstToken(run: RunResult): number | null {
  return average(run.turns.flatMap((turn) => (turn.firstTokenMs === null ? [] : [turn.firstTokenMs])));
}

/** 정상화 위로가 들어간 답의 비율을 퍼센트 글로. 답이 없으면 `-`. */
export function reassureText(run: RunResult): string {
  return percent(reassureRate(run.turns.map((turn) => turn.answer)));
}

/**
 * 판정기가 더한 턴 분석의 칸(#27). 서버가 채우기 전의 결과와 위기·판정 실패 턴에는 없다.
 * `client.ts` 의 응답 타입에 아직 없어 여기서 덧붙여 읽는다.
 */
type JudgedAnalysis = TurnAnalysisResponse & {
  replyLabel?: ReplyLabel;
  replyLabelProbability?: number;
  replyJudge?: string;
};

function judgedAnalyses(run: RunResult): JudgedAnalysis[] {
  return run.analysis.analyses as JudgedAnalysis[];
}

/** 판정기 라벨 기준 일반 위로의 비율(0~1). 라벨이 하나도 없으면 null. */
export function runGenericRate(run: RunResult): number | null {
  return genericRate(judgedAnalyses(run).map((a) => a.replyLabel));
}

/** 판정기 라벨 기준 일반 위로의 비율을 퍼센트 글로. 라벨이 없으면 `-`. */
export function genericText(run: RunResult): string {
  return percent(runGenericRate(run));
}

/** `expect.minTask` 에 못 미치면 그 문구, 아니면 null. */
export function minTaskShortfall(run: RunResult): string | null {
  const min = run.persona.expect?.minTask;
  const reached = reachedTask(run);
  return min !== undefined && reached < min ? `minTask 미달: 도달 과제 ${reached} < ${min}` : null;
}

// ── 인물 md ──

export { cell, table };

const flagText = (flag: Flag): string => `${flag.check}(${flag.level}): ${flag.detail}`;

function expectText(run: RunResult): string {
  const expect = run.persona.expect;
  if (expect === undefined) return "-";
  const parts = [
    expect.noCrisis === true ? "noCrisis" : null,
    expect.crisisAtTurn !== undefined ? `crisisAtTurn ${expect.crisisAtTurn}` : null,
    expect.minTask !== undefined ? `minTask ${expect.minTask}` : null,
  ];
  return parts.filter((p) => p !== null).join(", ") || "-";
}

function headSection(run: SavedRun): string[] {
  const shortfall = minTaskShortfall(run);
  const lines = [
    `# ${run.persona.name} — 대화 실측`,
    "",
    ...table(
      ["칸", "값"],
      [
        ["인물", run.persona.name],
        ["상황", run.persona.situation],
        ["언어", run.persona.language],
        ["세션", run.sessionId],
        ["시작", run.startedAt],
        ["closedBy", `${run.closedBy} (closed ${run.closed})`],
        ["도달 과제", shortfall === null ? reachedTask(run) : `${reachedTask(run)} — ${shortfall}`],
        ["최고 지원 수준", highestSupportLevel(run)],
        ["기대", expectText(run)],
        ["서버", run.baseUrl],
      ],
    ),
  ];
  if (shortfall !== null) lines.push("", `> ⚠ ${shortfall}`);
  return lines;
}

function turnSection(run: RunResult): string[] {
  const traced = hasTrace(run);
  const rows = run.turns.map((turn) => [
    turn.index,
    turn.user,
    turn.answer,
    `과제 ${turn.task ?? "-"} · 수준 ${turn.supportLevel} · 진행 ${turn.progress}${turn.done ? " · done" : ""}`,
    turn.flags.length === 0 ? "-" : turn.flags.map(flagText).join("\n"),
    latencyText(turn.latencyMs, turn.firstTokenMs),
    moveCell(turn),
    ...(traced ? [traceCell(run, turn.index)] : []),
  ]);
  const header = ["#", "사용자 발화", "답", "과제·수준", "검사 표시", "지연", "동작", ...(traced ? ["추적"] : [])];
  return [
    `## 첫 인사 (${seconds(run.greetingLatencyMs)})`,
    "",
    ...run.greeting.split("\n").map((line) => `> ${line}`),
    "",
    "## 턴",
    "",
    ...(rows.length === 0 ? ["턴 없음"] : table(header, rows)),
    ...(traced ? ["", `추적의 시스템 프롬프트 전문은 \`${run.persona.name}.trace.md\` 에 있다.`] : []),
  ];
}

function sessionCheckSection(run: RunResult): string[] {
  const flags = run.sessionFlags.map((flag) => `- ${flagText(flag)}`);
  return ["## 세션 검사", "", ...(flags.length === 0 ? ["없음"] : flags)];
}

function reportSection(run: RunResult): string[] {
  if (run.report === null) return ["## 리포트", "", "리포트 없음"];
  const sections = run.report.sections.flatMap((section) => [
    `### ${section.key}`,
    "",
    section.body,
    ...(section.tags && section.tags.length > 0 ? ["", `태그: ${section.tags.join(", ")}`] : []),
    "",
  ]);
  return [
    "## 리포트",
    "",
    `petName ${run.report.petName}, 도달 과제 ${run.report.reachedTask}, 언어 ${run.report.locale}`,
    "",
    ...sections,
  ];
}

/** `generic_comfort 0.82 (haiku)` 꼴. 라벨이 없으면 `-`. */
function replyLabelText(a: JudgedAnalysis): string {
  if (a.replyLabel === undefined) return "-";
  const probability = a.replyLabelProbability === undefined ? "" : ` ${a.replyLabelProbability.toFixed(2)}`;
  const judge = a.replyJudge === undefined ? "" : ` (${a.replyJudge})`;
  return `${a.replyLabel}${probability}${judge}`;
}

function analysisSection(run: RunResult): string[] {
  const analyses = judgedAnalyses(run);
  const lines = ["## 분석 요약", ""];
  const summary = run.analysis.summary;
  if (summary !== undefined) lines.push(`- 요약: ${summary.headline} / 다음: ${summary.followUp}`, "");
  if (analyses.length === 0) return [...lines, "분석 없음"];
  const rows = analyses.map((a, i) => [
    i + 1,
    a.at,
    a.task,
    a.phase,
    `${a.risk.level} (${a.risk.detectedBy})`,
    `${a.transition.from}→${a.transition.to}${a.transition.advanced ? " 전이" : ""}, retry ${a.transition.retryCount}`,
    replyLabelText(a),
  ]);
  return [...lines, ...table(["#", "시각", "과제", "phase", "risk", "transition", "replyLabel"], rows)];
}

function verdictSection(run: RunResult): string[] {
  return [
    "## 판정",
    "",
    "판정 값은 `적절` / `부적절` / `보류`, 사유는 한 줄(스킬 `chat-eval` 5절).",
    "",
    ...table(
      ["#", "판정", "사유"],
      run.turns.map((turn) => [turn.index, "", ""]),
    ),
  ];
}

/** 인물 하나의 보고서. */
export function personaMarkdown(run: SavedRun): string {
  return `${[
    ...headSection(run),
    "",
    ...turnSection(run),
    "",
    ...sessionCheckSection(run),
    "",
    ...moveSection(run),
    "",
    ...reportSection(run),
    "",
    ...analysisSection(run),
    "",
    ...verdictSection(run),
  ].join("\n")}\n`;
}

// ── summary md ──

/** 기준이 있으면 `기준 → 지금`, 한쪽이 없으면 `-`. */
function pair(now: string | null, before: string | null, withBaseline: boolean): string {
  if (!withBaseline) return now ?? "-";
  return `${before ?? "-"} → ${now ?? "-"}`;
}

type Stats = Record<string, string>;

function stats(run: RunResult): Stats {
  return {
    turns: String(run.turns.length),
    closedBy: run.closedBy,
    reached: String(reachedTask(run)),
    latency: seconds(averageLatency(run)),
    firstToken: seconds(averageFirstToken(run)),
    reassure: reassureText(run),
    generic: genericText(run),
    ...Object.fromEntries(MOVE_IDS.map((id) => [id, percent(runMoveRates(run)[id])])),
    moveAny: percent(runMoveRates(run).any),
    lengthVariance: lengthSpreadText(runLengthSpread(run)),
  };
}

/** 지금 − 기준. 한쪽이 없으면 `-`. */
function delta(now: number | null, before: number | null, unit: (diff: number) => string): string {
  if (now === null || before === null) return "-";
  return unit(now - before);
}

const signed = (text: string, diff: number): string => (diff > 0 ? `+${text}` : text);
const latencyDelta = (diff: number): string => signed(`${(diff / 1000).toFixed(1)}s`, diff);
const pointDelta = (diff: number): string => signed(`${Math.round(diff * 100)}%p`, diff);

const charDelta = (diff: number): string => signed(`${Math.round(diff)}자`, diff);

const of =
  <T>(f: (run: RunResult) => T | null) =>
  (run: RunResult | undefined): T | null =>
    run === undefined ? null : f(run);

/** 기준 대비 평균 지연과 genericRate 의 차이. 판정기와 후보 고르기가 지연과 상투성을 얼마나 바꿨는지 본다(#27). */
function deltaSection(names: string[], now: Map<string, RunResult>, before: Map<string, RunResult>): string[] {
  const latencyOf = of(averageLatency);
  const genericOf = of(runGenericRate);
  const rows = names.map((name) => {
    const [n, b] = [now.get(name), before.get(name)];
    return [name, delta(latencyOf(n), latencyOf(b), latencyDelta), delta(genericOf(n), genericOf(b), pointDelta)];
  });
  return [
    "## 기준 대비 차이 (지금 − 기준)",
    "",
    ...table(["인물", "평균 지연 차이", "일반 위로(genericRate) 차이"], rows),
  ];
}

/** 기준 대비 동작(셋 중 하나라도) 비율과 답 길이 표준편차의 차이. 페르소나와 화법 규칙이 바꾼 것을 본다(#37). */
function moveDeltaSection(names: string[], now: Map<string, RunResult>, before: Map<string, RunResult>): string[] {
  const movesOf = of((run) => runMoveRates(run).any);
  const sdOf = of((run) => runLengthSpread(run)?.sd ?? null);
  const rows = names.map((name) => {
    const [n, b] = [now.get(name), before.get(name)];
    return [name, delta(movesOf(n), movesOf(b), pointDelta), delta(sdOf(n), sdOf(b), charDelta)];
  });
  return [
    "## 기준 대비 동작 차이 (지금 − 기준)",
    "",
    ...table(["인물", "동작 셋 중 하나라도 차이", "답 길이 표준편차 차이"], rows),
  ];
}

/** 날짜 폴더의 결과로 summary 를 만든다. 기준이 있으면 인물은 두 날짜의 합집합, 칸은 `기준 → 지금`. */
export function summaryMarkdown(date: string, runs: SavedRun[], baseline: Baseline | null = null): string {
  const now = new Map(runs.map((run) => [run.persona.name, run]));
  const before = new Map((baseline?.runs ?? []).map((run) => [run.persona.name, run]));
  const names = [...new Set([...now.keys(), ...before.keys()])].sort();
  const withBaseline = baseline !== null;
  const countOf = (run: RunResult | undefined, id: CheckId) =>
    run === undefined ? null : String(checkCounts(run)[id]);
  const statOf = (run: RunResult | undefined, key: string) => (run === undefined ? null : (stats(run)[key] ?? null));

  const checkRows = names.map((name) => [
    name,
    ...CHECK_IDS.map((id) => pair(countOf(now.get(name), id), countOf(before.get(name), id), withBaseline)),
  ]);
  const statKeys = ["turns", "closedBy", "reached", "latency", "firstToken", "reassure", "generic"];
  const rowsOf = (keys: string[]) =>
    names.map((name) => [
      name,
      ...keys.map((key) => pair(statOf(now.get(name), key), statOf(before.get(name), key), withBaseline)),
    ]);
  const statRows = rowsOf(statKeys);
  const moveRows = rowsOf([...MOVE_IDS, "moveAny", "lengthVariance"]);
  const shortfalls = runs.flatMap((run) => {
    const text = minTaskShortfall(run);
    return text === null ? [] : [`- ${run.persona.name}: ${text}`];
  });
  return `${[
    `# 대화 실측 요약 (${date})`,
    "",
    withBaseline
      ? `기준 ${baseline.date} → 지금 ${date}. 칸은 \`기준 → 지금\`, 없는 쪽은 \`-\`.`
      : `인물 ${runs.length}명.`,
    "",
    "## 인물 × 검사 (표시 수)",
    "",
    ...table(["인물", ...CHECK_IDS], checkRows),
    "",
    "## 인물별 결과",
    "",
    ...table(
      [
        "인물",
        "턴",
        "closedBy",
        "도달 과제",
        "평균 지연",
        "평균 첫 토큰",
        "정상화 위로(reassureRate)",
        "일반 위로(genericRate)",
      ],
      statRows,
    ),
    "",
    "## 인물별 동작과 길이",
    "",
    "동작은 그 패턴이 담긴 동반자 턴의 비율, 길이는 답 글자 수의 표준편차와 평균이다. 위기 턴(고정 안내)은 뺀다.",
    "",
    ...table(
      [
        "인물",
        "감정 추정(feelingGuess)",
        "뜻 부여(meaningGiven)",
        "허락(permission)",
        "셋 중 하나라도",
        "답 길이(lengthVariance)",
      ],
      moveRows,
    ),
    "",
    `동작 셋 중 하나라도 담긴 턴, 인물 전체(위기 턴 제외): ${pair(movesTotalText(runs), baseline === null ? null : movesTotalText(baseline.runs), withBaseline)}`,
    "",
    ...greetingSection(runs, baseline === null ? null : baseline.runs),
    ...(withBaseline ? ["", ...deltaSection(names, now, before), "", ...moveDeltaSection(names, now, before)] : []),
    ...(shortfalls.length === 0 ? [] : ["", "## minTask 미달", "", ...shortfalls]),
  ].join("\n")}\n`;
}

// ── 파일 ──

/** 로컬 날짜 `YYYY-MM-DD`. */
export function localDate(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** 날짜 폴더의 경로. `CHAT_EVAL_OUT` 이 있으면 그 아래(레포 루트 기준)이고, `outputs/` 밖이면 던진다. */
export function chatEvalDir(root: string, date: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!DATE.test(date)) throw new Error(`날짜는 YYYY-MM-DD 입니다: ${date}`);
  const custom = env.CHAT_EVAL_OUT?.trim();
  const base = custom ? resolve(root, custom) : join(root, "outputs", "chat-eval");
  const outputs = join(root, "outputs");
  if (!`${base}${sep}`.startsWith(`${outputs}${sep}`) || base === outputs) {
    throw new Error(`CHAT_EVAL_OUT 은 outputs/ 아래여야 합니다: ${relative(root, base) || "."}`);
  }
  return join(base, date);
}

/** 인물 하나의 결과를 `<인물>.run.json` 과 `<인물>.md` 로 쓴다. 쓴 md 의 경로를 돌려준다. */
export function saveRun(dir: string, run: SavedRun): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${run.persona.name}${RUN_SUFFIX}`), `${JSON.stringify(run, null, 2)}\n`);
  const md = join(dir, `${run.persona.name}.md`);
  writeFileSync(md, personaMarkdown(run));
  const trace = traceMarkdown(run);
  if (trace !== null) writeFileSync(join(dir, `${run.persona.name}.trace.md`), trace);
  return md;
}

/** 폴더의 `.run.json` 을 이름순으로 읽는다. 폴더가 없으면 빈 배열. */
export function loadRuns(dir: string): SavedRun[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(RUN_SUFFIX))
    .sort()
    .map((entry) => JSON.parse(readFileSync(join(dir, entry), "utf8")) as SavedRun);
}

/** 기준 날짜의 결과. 폴더가 없으면 던지고, 결과 json 이 없으면 runs 가 빈 채로 돌려준다(부르는 쪽이 알린다). */
export function readBaseline(dir: string, date: string): Baseline {
  if (!existsSync(dir)) throw new Error(`기준 날짜의 폴더가 없습니다: ${dir}`);
  return { date, runs: loadRuns(dir) };
}

/** 폴더의 결과를 모두 읽어 `summary.md` 를 다시 쓴다. 기준에 결과가 없으면 기준 없이 쓴다. 쓴 경로를 돌려준다. */
export function writeSummary(dir: string, date: string, baseline: Baseline | null): string {
  const path = join(dir, "summary.md");
  const usable = baseline !== null && baseline.runs.length > 0 ? baseline : null;
  writeFileSync(path, summaryMarkdown(date, loadRuns(dir), usable));
  return path;
}
