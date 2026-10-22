// 궤적 하나를 끝까지 돌리는 실행기. 세션마다 기존 실행기(`runPersona`)로 대본을 보내고, 그 세션의 API 호출이 모두 끝나면
// DB 의 시각을 과거로 민 뒤 다음 세션을 연다. 다음 세션의 재개는 밀린 직전 세션을 DB 에서 읽는다.
//
// 세션이 끝나면 (1) 그 세션의 기억 추출이 끝나기를 잠깐 기다리고(추출은 답 뒤 비동기다. 추출 호출 수가 모델이 답한 턴 수에
// 닿거나 `memoryWaitMs` 가 지나면 그만 기다린다), (2) 소유자의 기억 건수를 세고(본문 없음), (3) 그때까지의 세션 전부를
// 다음 세션까지의 간격만큼 민다(`shiftStepAfter`).
//
// QA 계정에 다른 세션이 남아 있으면 재개가 그것을 집는다(밀린 이번 궤적의 세션보다 created_at 이 늦다). 그래서 부르는 쪽(cli)은
// 남은 세션이 있으면 시작하지 않고, `--reset-qa` 면 `resetQaSessions` 로 서버의 삭제 API 를 불러 치운다.

import {
  type Arc,
  type ArcSession,
  checkProbe,
  gapDaysBefore,
  type ProbeResult,
  type ProbeType,
  shiftDaysOf,
  shiftedAt,
  shiftStepAfter,
} from "./arc.ts";
import type { MemoryCounts, SandboxDb, ShiftCounts } from "./arc-db.ts";
import type { ChatClient } from "./client.ts";
import type { Persona } from "./persona.ts";
import type { SavedRun } from "./report.ts";
import { localDate } from "./report.ts";
import { runPersona, type TurnRecord } from "./runner.ts";

/** 세션 하나의 저장 결과. 기존 `<인물>.run.json` 모양에 궤적의 칸을 더한다. */
export type ArcSessionRun = SavedRun & {
  /** 1 부터. */
  index: number;
  dayOffset: number;
  label: string;
  expectCrisis: boolean;
  /** 민 날 수(0 이하). */
  shiftDays: number;
  /** 밀린 뒤의 시작 날짜(로컬 `YYYY-MM-DD`). */
  shiftedDate: string;
  /** 이 세션이 처음 밀릴 때 바뀐 행 수. */
  shiftCounts: ShiftCounts;
  /** 이 세션이 끝난 뒤 소유자의 장기기억 건수. 기억 테이블이 없으면 null. */
  memory: MemoryCounts | null;
};

export type ArcProbeRow = {
  session: number;
  turn: number;
  type: ProbeType;
  note: string | null;
  user: string | null;
  answer: string | null;
  result: ProbeResult;
};

export type SavedArc = {
  arc: Arc;
  baseUrl: string;
  startedAt: string;
  /** `--reset-qa` 로 지운 세션 수. 옵션을 주지 않았으면 null. */
  resetDeleted: number | null;
  sessions: ArcSessionRun[];
  probes: ArcProbeRow[];
};

/** 궤적의 세션 하나를 실행기의 인물로 바꾼다. 첫 세션만 프로필을 보낸다. 위기 세션이 아니면 위기 없음을 기대한다. */
export function sessionPersona(arc: Arc, session: ArcSession, index: number): Persona {
  const persona: Persona = {
    name: `${arc.name}-s${index + 1}`,
    situation: `${arc.situation} — ${session.label}`,
    language: arc.language,
    profile: index === 0 ? arc.profile : null,
    turns: session.turns,
  };
  if (!session.expectCrisis) persona.expect = { noCrisis: true };
  return persona;
}

/** 세션의 probe 를 그 턴의 답에 대 본다. `gapDays` 는 앞 세션부터의 날 수(첫 세션은 null)이고 time_gap 검사에 쓴다. */
export function probeRows(
  index: number,
  session: ArcSession,
  turns: TurnRecord[],
  gapDays: number | null = null,
): ArcProbeRow[] {
  return session.probes.map((probe) => {
    const turn = turns[probe.turn - 1];
    return {
      session: index + 1,
      turn: probe.turn,
      type: probe.type,
      note: probe.note ?? null,
      user: turn?.user ?? null,
      answer: turn?.answer ?? null,
      result: checkProbe(probe, turn?.answer ?? null, gapDays),
    };
  });
}

/** 이 수준부터 위기 턴이다. 위기 턴은 고정 문구라 서버가 기억을 추출하지 않는다. */
const CRISIS_LEVEL = 3;

/** 서버가 기억을 추출할 턴 수: 답이 있고 위기가 아닌 턴. */
export function extractableTurns(turns: readonly TurnRecord[]): number {
  return turns.filter((turn) => turn.supportLevel < CRISIS_LEVEL && turn.answer.trim() !== "").length;
}

const POLL_MS = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 그 세션의 추출 호출이 `expected` 에 닿거나 `waitMs` 가 지날 때까지 기다린다. */
async function waitForExtraction(db: SandboxDb, sessionId: string, expected: number, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && (await db.extractCalls(sessionId)) < expected) {
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
  }
}

/** QA 계정 본인의 세션을 서버의 삭제 API 로 모두 지운다(목록이 빌 때까지). 지운 수를 돌려준다. */
export async function resetQaSessions(client: ChatClient): Promise<number> {
  let deleted = 0;
  for (;;) {
    const sessions = await client.list();
    if (sessions.length === 0) return deleted;
    for (const session of sessions) {
      await client.remove(session.sessionId);
      deleted += 1;
    }
  }
}

export type ArcRunOptions = {
  client: ChatClient;
  db: SandboxDb;
  stream: boolean;
  resetDeleted: number | null;
  onSession?: (index: number, session: ArcSession) => void;
  onTurn?: (turn: TurnRecord) => void;
  onSessionDone?: (run: ArcSessionRun) => void;
  /** 세션 뒤 기억 추출을 기다리는 최대 시간(ms). 기본 30초. */
  memoryWaitMs?: number;
};

const DEFAULT_MEMORY_WAIT_MS = 30_000;

export async function runArc(arc: Arc, options: ArcRunOptions): Promise<SavedArc> {
  const startedAt = new Date().toISOString();
  const shifts = shiftDaysOf(arc.sessions);
  const petNames = arc.profile.petName ? [arc.profile.petName] : [];
  const sessions: ArcSessionRun[] = [];
  const probes: ArcProbeRow[] = [];
  for (const [index, session] of arc.sessions.entries()) {
    options.onSession?.(index, session);
    const run = await runPersona(sessionPersona(arc, session, index), {
      client: options.client,
      mode: "script",
      stream: options.stream,
      petNames,
      onTurn: (turn) => options.onTurn?.(turn),
    });
    await waitForExtraction(
      options.db,
      run.sessionId,
      extractableTurns(run.turns),
      options.memoryWaitMs ?? DEFAULT_MEMORY_WAIT_MS,
    );
    const memory = await options.db.memoryCounts(run.sessionId);
    // 이 세션의 API 호출이 모두 끝난 뒤에 민다(서버가 세션을 다시 저장하면 전사의 시각을 덮는다). 앞 세션들도 같은 날 수만큼
    // 더 밀어, 다음 세션이 열릴 때 서버가 보는 경과가 궤적의 간격과 같게 한다.
    const step = shiftStepAfter(arc.sessions, index);
    const shiftCounts = await options.db.shiftSession(run.sessionId, step);
    if (step !== 0) {
      for (const earlier of sessions) await options.db.shiftSession(earlier.sessionId, step);
    }
    const shiftDays = shifts[index] ?? 0;
    const saved: ArcSessionRun = {
      ...run,
      baseUrl: options.client.baseUrl,
      index: index + 1,
      dayOffset: session.dayOffset,
      label: session.label,
      expectCrisis: session.expectCrisis,
      shiftDays,
      shiftedDate: localDate(shiftedAt(new Date(run.startedAt), shiftDays)),
      shiftCounts,
      memory,
    };
    sessions.push(saved);
    probes.push(...probeRows(index, session, run.turns, gapDaysBefore(arc.sessions, index)));
    options.onSessionDone?.(saved);
  }
  return { arc, baseUrl: options.client.baseUrl, startedAt, resetDeleted: options.resetDeleted, sessions, probes };
}
