// 장기기억 실측의 궤적 파일(`dev-tools/chat-eval/arcs/<이름>.json`)을 읽고, 궤적에 붙는 순수 계산을 둔다.
//
// - 궤적은 한 인물의 세션 여럿이다. 첫 세션만 프로필을 보내고 나머지는 재개(프로필 없음)로 시작한다.
// - `dayOffset` 은 첫 세션(0)부터의 날 수이고 줄지 않는다. 도구는 마지막 세션이 오늘이 되도록 세션마다 DB 의 시각을
//   `dayOffset − max` 일만큼 민다(`shiftDaysOf`). 밀기 자체는 `arc-db.ts` 가 한다. 한 번에 밀지 않고 세션이 끝날 때마다
//   그때까지의 세션 전부를 다음 세션까지의 간격만큼 민다(`shiftStepAfter`). 다음 세션이 열릴 때 서버가 보는 경과가 궤적의
//   간격과 같아야 하기 때문이다(한 번에 밀면 둘째 세션이 첫 세션과 `max` 일 떨어진 것으로 보인다). 끝난 뒤의 시각은 같다.
// - probe 는 그 세션 그 턴의 답을 낱말로 대 본다(`checkProbe`). `time_gap`, `after_crisis` 는 사람이 판정한다. 다만 `time_gap`
//   의 답에 경과 시간의 수(일·주·달)가 있으면 앞 세션부터의 간격과 어긋나는지 기계가 보고, 어긋나면 fail 이다.

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { checkElapsed, type ElapsedCheck } from "./checks.ts";
import {
  fail,
  type GriefProfile,
  isObject,
  type Json,
  type Language,
  parseProfile,
  rejectUnknown,
  requiredString,
} from "./persona.ts";

export type ProbeType = "time_gap" | "fact_recall" | "detail_recall" | "no_false_memory" | "after_crisis";

export const PROBE_TYPES: readonly ProbeType[] = [
  "time_gap",
  "fact_recall",
  "detail_recall",
  "no_false_memory",
  "after_crisis",
];

/** `turn` 은 그 세션의 사용자 턴 번호(1 부터). */
export type Probe = { turn: number; type: ProbeType; expect?: string[]; reject?: string[]; note?: string };

export type ArcFact = { key: string; value: string; introducedInSession: number };

export type ArcSession = {
  dayOffset: number;
  label: string;
  turns: string[];
  probes: Probe[];
  expectCrisis: boolean;
};

export type Arc = {
  /** 파일 이름(확장자 뺀 것)과 같다. `--arc` 로 고르는 이름이다. */
  name: string;
  situation: string;
  language: Language;
  /** 첫 세션에만 보낸다. */
  profile: GriefProfile;
  facts: ArcFact[];
  sessions: ArcSession[];
};

const ARC_FIELDS = ["name", "situation", "language", "profile", "facts", "sessions"] as const;
const SESSION_FIELDS = ["dayOffset", "label", "turns", "probes", "expectCrisis", "note"] as const;
const PROBE_FIELDS = ["turn", "type", "expect", "reject", "note"] as const;
const FACT_FIELDS = ["key", "value", "introducedInSession"] as const;

function nonNegativeInt(file: string, field: string, value: Json | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(file, field, "는 0 이상의 정수입니다");
  return value;
}

function stringList(file: string, field: string, value: Json | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) fail(file, field, "는 빈 배열이 아닌 배열입니다");
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") fail(file, `${field}[${index}]`, "는 빈칸 아닌 문자열입니다");
    return item;
  });
}

function parseProbe(file: string, field: string, value: Json, turnCount: number): Probe {
  if (!isObject(value)) fail(file, field, "는 객체입니다");
  rejectUnknown(file, value, PROBE_FIELDS, `${field}.`);
  const turn = nonNegativeInt(file, `${field}.turn`, value.turn);
  if (turn < 1 || turn > turnCount) fail(file, `${field}.turn`, `는 1 부터 ${turnCount} 사이입니다`);
  const type = value.type;
  if (typeof type !== "string" || !(PROBE_TYPES as readonly string[]).includes(type)) {
    fail(file, `${field}.type`, `는 ${PROBE_TYPES.join(", ")} 중 하나입니다`);
  }
  const probe: Probe = { turn, type: type as ProbeType };
  const expect = stringList(file, `${field}.expect`, value.expect);
  const reject = stringList(file, `${field}.reject`, value.reject);
  if (expect !== undefined) probe.expect = expect;
  if (reject !== undefined) probe.reject = reject;
  if (typeof value.note === "string") probe.note = value.note;
  if ((type === "fact_recall" || type === "detail_recall") && expect === undefined) {
    fail(file, `${field}.expect`, `가 없습니다(${type})`);
  }
  if (type === "no_false_memory" && reject === undefined) fail(file, `${field}.reject`, "가 없습니다(no_false_memory)");
  return probe;
}

function parseSession(file: string, index: number, value: Json, previousOffset: number): ArcSession {
  const field = `sessions[${index}]`;
  if (!isObject(value)) fail(file, field, "는 객체입니다");
  rejectUnknown(file, value, SESSION_FIELDS, `${field}.`);
  const dayOffset = nonNegativeInt(file, `${field}.dayOffset`, value.dayOffset);
  if (index === 0 && dayOffset !== 0) fail(file, `${field}.dayOffset`, "는 0 이어야 합니다(첫 세션)");
  if (dayOffset < previousOffset)
    fail(file, `${field}.dayOffset`, `는 앞 세션(${previousOffset})보다 작을 수 없습니다`);
  const turns = stringList(file, `${field}.turns`, value.turns);
  if (turns === undefined) fail(file, `${field}.turns`, "가 없습니다");
  const probes = value.probes ?? [];
  if (!Array.isArray(probes)) fail(file, `${field}.probes`, "는 배열입니다");
  const expectCrisis = value.expectCrisis ?? false;
  if (typeof expectCrisis !== "boolean") fail(file, `${field}.expectCrisis`, "는 true 나 false 입니다");
  return {
    dayOffset,
    label: requiredString(file, value, "label"),
    turns,
    probes: probes.map((probe, k) => parseProbe(file, `${field}.probes[${k}]`, probe, turns.length)),
    expectCrisis,
  };
}

function parseFact(file: string, index: number, value: Json): ArcFact {
  const field = `facts[${index}]`;
  if (!isObject(value)) fail(file, field, "는 객체입니다");
  rejectUnknown(file, value, FACT_FIELDS, `${field}.`);
  return {
    key: requiredString(file, value, "key"),
    value: requiredString(file, value, "value"),
    introducedInSession: nonNegativeInt(file, `${field}.introducedInSession`, value.introducedInSession),
  };
}

/** 궤적 파일의 글을 검증해 읽는다. `file` 은 오류 문구에 쓰는 파일 이름이고, 확장자 뺀 것이 `name` 과 같아야 한다. */
export function parseArc(file: string, text: string): Arc {
  let raw: Json;
  try {
    raw = JSON.parse(text) as Json;
  } catch (error) {
    throw new Error(`${file}: JSON 이 아닙니다 (${(error as Error).message})`);
  }
  if (!isObject(raw)) throw new Error(`${file}: 객체가 아닙니다`);
  rejectUnknown(file, raw, ARC_FIELDS, "");
  const name = requiredString(file, raw, "name");
  const stem = basename(file).replace(/\.json$/, "");
  if (name !== stem) fail(file, "name", `은 파일 이름(${stem})과 같아야 합니다`);
  const language = requiredString(file, raw, "language");
  if (language !== "ko" && language !== "en") fail(file, "language", "는 ko, en 중 하나입니다");
  const profile = parseProfile(file, raw.profile);
  if (profile === null) fail(file, "profile", "는 첫 세션에 보낼 객체입니다(null 안 됨)");
  const facts = raw.facts ?? [];
  if (!Array.isArray(facts)) fail(file, "facts", "는 배열입니다");
  const sessions = raw.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) fail(file, "sessions", "는 빈 배열이 아닌 배열입니다");
  const parsed: ArcSession[] = [];
  for (const [index, session] of sessions.entries()) {
    parsed.push(parseSession(file, index, session, parsed.at(-1)?.dayOffset ?? 0));
  }
  return {
    name,
    situation: requiredString(file, raw, "situation"),
    language,
    profile,
    facts: facts.map((fact, index) => parseFact(file, index, fact)),
    sessions: parsed,
  };
}

export function loadArc(path: string): Arc {
  return parseArc(basename(path), readFileSync(path, "utf8"));
}

/** 레포 루트에서 궤적 폴더의 경로. */
export function arcsDir(root: string): string {
  return join(root, "dev-tools", "chat-eval", "arcs");
}

// ── 날짜 밀기 ──

/** 세션마다 밀 날 수(0 이하). 마지막(가장 큰 dayOffset) 세션이 0, 첫 세션이 −max 다. */
export function shiftDaysOf(sessions: readonly { dayOffset: number }[]): number[] {
  const max = Math.max(0, ...sessions.map((session) => session.dayOffset));
  return sessions.map((session) => session.dayOffset - max);
}

/**
 * 세션 `index` 가 끝난 뒤 그때까지의 세션 전부를 밀 날 수(0 이하): 다음 세션까지의 간격의 음수. 마지막 세션 뒤는 0.
 * 세션마다 이 값을 더하면 `shiftDaysOf` 와 같다.
 */
export function shiftStepAfter(sessions: readonly { dayOffset: number }[], index: number): number {
  const next = sessions[index + 1];
  const current = sessions[index];
  if (next === undefined || current === undefined) return 0;
  return current.dayOffset - next.dayOffset;
}

/** 세션 `index` 가 열릴 때 앞 세션부터 지난 날 수. 첫 세션은 null. */
export function gapDaysBefore(sessions: readonly { dayOffset: number }[], index: number): number | null {
  const previous = sessions[index - 1];
  const current = sessions[index];
  if (previous === undefined || current === undefined) return null;
  return current.dayOffset - previous.dayOffset;
}

const DAY_MS = 86_400_000;

/** 시각 `at` 을 `days` 일 민 시각. */
export function shiftedAt(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

// ── probe 검사 ──

/** 표시 이름. 낱말로 대 보는 것만 이름이 있다. */
export type ProbeCheck = "factRecall" | "detailRecall" | "noFalseMemory";

const PROBE_CHECK: Partial<Record<ProbeType, ProbeCheck>> = {
  fact_recall: "factRecall",
  detail_recall: "detailRecall",
  no_false_memory: "noFalseMemory",
};

/**
 * pass/fail: 낱말 검사의 결과. manual: 사람이 판정할 것(time_gap, after_crisis). missing: 세션이 그 턴 전에 닫혀 답이 없다.
 */
export type ProbeOutcome = "pass" | "fail" | "manual" | "missing";

export type ProbeResult = {
  check: ProbeCheck | null;
  outcome: ProbeOutcome;
  /** 답에 있던 expect 낱말. */
  found: string[];
  /** 답에 있던 reject 낱말. */
  rejected: string[];
  /** time_gap 에서 앞 세션이 있을 때만: 답의 경과 시간 말과 실제 간격. */
  elapsed?: ElapsedCheck;
};

const contains = (answer: string, word: string): boolean => answer.toLowerCase().includes(word.toLowerCase());

/**
 * probe 하나를 답에 대 본다. expect 는 하나라도 있으면 되고, reject 는 하나도 없어야 한다.
 * `answer` 가 null 이면(그 턴까지 가지 못함) missing 이다. `gapDays` 는 앞 세션부터의 날 수이고(첫 세션은 null),
 * time_gap 에서 답의 경과 시간 말이 그와 어긋나면 fail, 아니면 사람 판정(manual)이다.
 */
export function checkProbe(probe: Probe, answer: string | null, gapDays: number | null = null): ProbeResult {
  const check = PROBE_CHECK[probe.type] ?? null;
  if (answer === null) return { check, outcome: "missing", found: [], rejected: [] };
  const found = (probe.expect ?? []).filter((word) => contains(answer, word));
  const rejected = (probe.reject ?? []).filter((word) => contains(answer, word));
  if (probe.type === "time_gap" && gapDays !== null) {
    const elapsed = checkElapsed(answer, gapDays);
    return { check, outcome: elapsed.mismatched.length > 0 ? "fail" : "manual", found, rejected, elapsed };
  }
  if (check === null) return { check, outcome: "manual", found, rejected };
  const expectOk = probe.expect === undefined || found.length > 0;
  return { check, outcome: expectOk && rejected.length === 0 ? "pass" : "fail", found, rejected };
}
