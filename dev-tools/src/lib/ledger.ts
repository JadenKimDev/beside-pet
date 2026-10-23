// 원장: 이슈 하나의 작업 목록과 그 판정. `docs/ledger/<이슈 번호>.json` 에 둔다.
//
// 여기 있는 함수는 모두 순수 함수다. 받은 원장은 고치지 않고 새 원장을 돌려준다.
// 판정 칸(`status`, `passes`, `retries`, 시각)은 러너만 쓴다. 사람과 에이전트가 고쳐도
// 되는 것은 작업의 정의(`title`, `scope`, `verify`)다.

import { deriveVerify, type RepoProbe, wantsTdd } from "./actions.ts";
import type { Prd, PrdTimes } from "./prd.ts";

export type TaskStatus = "todo" | "doing" | "done" | "parked" | "needs_spec";

/** 검증이 이만큼 연달아 실패하면 작업을 세워 둔다. */
export const PARK_AFTER = 5;
/** 이 횟수부터는 다시 돌리기 전에 원인을 먼저 보라고 알린다. */
export const DIAGNOSE_AFTER = 3;

export interface LedgerTask {
  id: string;
  title: string;
  scope: string[];
  depends_on: string[];
  verify: string[];
  /** 테스트를 먼저 쓰는 작업인가. 그렇다면 실패를 먼저 기록해야 판정을 받는다. */
  tdd: boolean;
  /** 테스트만 쓴 상태에서 검증이 실패한 것을 러너가 확인한 시각. */
  red_at: string | null;
  status: TaskStatus;
  passes: boolean;
  retries: number;
  started_at: string | null;
  finished_at: string | null;
  /** `work` 부터 검증 통과까지 걸린 시간. */
  active_ms: number | null;
  /** 마지막 검증 명령들이 도는 데 걸린 시간. */
  verify_ms: number | null;
}

export interface Ledger {
  issue: number;
  title: string;
  prd: string;
  depends_on: number[];
  created_at: string;
  /** PRD 머리말의 초안 시작·초안 올림·승인 시각. 이 칸이 생기기 전의 원장에는 없다: `prdTimesOf` 로 읽는다. */
  prd_times?: PrdTimes;
  tasks: LedgerTask[];
}

export interface Outcome {
  issue: number;
  title: string;
  finished_at: string;
  /** 첫 작업을 집은 때부터 마감까지. */
  lead_time_ms: number;
  active_ms: number;
  /** 원장의 `prd_times` 를 그대로 옮긴 것. 이 칸이 생기기 전의 행에는 없다: `prdTimesOf` 로 읽는다. */
  prd_times?: PrdTimes;
  tasks: {
    id: string;
    title: string;
    scope: string[];
    status: TaskStatus;
    retries: number;
    active_ms: number | null;
    verify_ms: number | null;
  }[];
}

/**
 * PRD 에 작업이 더해졌을 때 원장을 잇는다. 새로 만든 원장(`fresh`)의 정의를 쓰되, 이미 있던
 * 작업의 판정 칸은 예전 원장(`before`)의 것을 그대로 둔다. 예전 원장에만 있는 작업이 있으면
 * 잇지 않는다: 판정이 내려진 작업이 사라지면 안 된다.
 */
export function extend(before: Ledger, fresh: Ledger): Ledger {
  const missing = before.tasks.filter((old) => !fresh.tasks.some((task) => task.id === old.id));
  if (missing.length > 0) {
    throw new Error(`PRD 에서 빠진 작업이 있어 원장을 이을 수 없습니다: ${missing.map((task) => task.id).join(", ")}`);
  }
  return {
    ...fresh,
    created_at: before.created_at,
    tasks: fresh.tasks.map((task) => {
      const old = before.tasks.find((candidate) => candidate.id === task.id);
      if (!old) {
        return task;
      }
      const { red_at, status, passes, retries, started_at, finished_at, active_ms, verify_ms } = old;
      return { ...task, red_at, status, passes, retries, started_at, finished_at, active_ms, verify_ms };
    }),
  };
}

/** 원장이나 실측 행의 세 시각. 칸이 없는 옛 파일은 세 값 모두 `null` 로 본다. */
export function prdTimesOf(record: { prd_times?: Partial<PrdTimes> | null }): PrdTimes {
  const times = record.prd_times ?? {};
  return {
    drafted_at: times.drafted_at ?? null,
    submitted_at: times.submitted_at ?? null,
    approved_at: times.approved_at ?? null,
  };
}

export function scaffold(
  prd: Prd,
  options: { prdFile: string; now: Date; probe: RepoProbe; tddAreas: readonly string[] },
): Ledger {
  if (prd.issue === null) {
    throw new Error("머리말에 issue 가 없습니다. 'pnpm prd:push' 로 이슈를 먼저 만드세요");
  }
  return {
    issue: prd.issue,
    title: prd.title,
    prd: options.prdFile,
    depends_on: prd.dependsOn,
    created_at: options.now.toISOString(),
    prd_times: { ...prd.times },
    tasks: prd.tasks.map((task) => {
      const verify = task.verify.length > 0 ? task.verify : deriveVerify(task.scope, options.probe);
      return {
        id: task.id,
        title: task.title,
        scope: task.scope,
        depends_on: task.dependsOn,
        verify,
        tdd: task.tdd ?? wantsTdd(task.scope, options.tddAreas),
        red_at: null,
        status: verify.length > 0 ? "todo" : "needs_spec",
        passes: false,
        retries: 0,
        started_at: null,
        finished_at: null,
        active_ms: null,
        verify_ms: null,
      };
    }),
  };
}

function find(ledger: Ledger, taskId: string): LedgerTask {
  const task = ledger.tasks.find((t) => t.id === taskId);
  if (!task) {
    const known = ledger.tasks.map((t) => t.id).join(", ");
    throw new Error(`작업 '${taskId}' 가 원장에 없습니다 (있는 작업: ${known})`);
  }
  return task;
}

/** 작업을 집는다: `todo` → `doing`. 이미 `doing` 이면 그대로 둔다. */
export function startTask(ledger: Ledger, taskId: string, now: Date): Ledger {
  const next = structuredClone(ledger);
  const task = find(next, taskId);
  if (task.status === "doing") {
    return next;
  }
  if (task.status === "needs_spec") {
    throw new Error(`작업 '${taskId}' 는 검증 명령이 없습니다. 원장의 verify 를 채운 뒤 status 를 todo 로 바꾸세요`);
  }
  if (task.status !== "todo") {
    throw new Error(`작업 '${taskId}' 는 이미 ${task.status} 입니다`);
  }
  const waiting = task.depends_on.filter((dep) => find(next, dep).status !== "done");
  if (waiting.length > 0) {
    throw new Error(`작업 '${taskId}' 는 먼저 끝나야 할 작업이 있습니다: ${waiting.join(", ")}`);
  }
  task.status = "doing";
  task.started_at = now.toISOString();
  return next;
}

/** 테스트를 먼저 쓰는 작업인데 아직 실패를 기록하지 않았는가. */
export function needsRed(task: LedgerTask): boolean {
  return task.tdd && task.red_at === null;
}

/**
 * 테스트만 쓴 상태의 검증 결과를 적는다. 실패해야 기록된다. 이 실패는 실패 횟수에 넣지 않는다.
 */
export function recordRed(ledger: Ledger, taskId: string, run: { failed: boolean; now: Date }): Ledger {
  const next = structuredClone(ledger);
  const task = find(next, taskId);
  if (task.status !== "doing") {
    throw new Error(`작업 '${taskId}' 는 ${task.status} 입니다. 'pnpm work' 로 먼저 집으세요`);
  }
  if (!task.tdd) {
    throw new Error(`작업 '${taskId}' 는 테스트를 먼저 쓰는 작업이 아닙니다. 바로 'pnpm ledger:verify' 를 쓰세요`);
  }
  if (task.red_at !== null) {
    throw new Error(`작업 '${taskId}' 의 실패는 이미 기록됐습니다`);
  }
  if (!run.failed) {
    throw new Error(
      `검증이 통과했습니다. 새 동작을 확인하는 테스트가 없거나, 이미 구현돼 있습니다. 실패하는 테스트를 먼저 쓰세요`,
    );
  }
  task.red_at = run.now.toISOString();
  return next;
}

/** 검증 결과를 적는다. 통과하면 `done`, 실패가 쌓이면 `parked`. */
export function recordVerdict(
  ledger: Ledger,
  taskId: string,
  verdict: { passed: boolean; verifyMs: number; now: Date },
): Ledger {
  const next = structuredClone(ledger);
  const task = find(next, taskId);
  if (task.status !== "doing") {
    throw new Error(`작업 '${taskId}' 는 ${task.status} 입니다. 'pnpm work' 로 먼저 집으세요`);
  }
  if (needsRed(task)) {
    throw new Error(
      `작업 '${taskId}' 는 테스트를 먼저 쓰는 작업입니다. 구현하기 전에 'pnpm ledger:red' 로 실패를 기록하세요`,
    );
  }
  task.verify_ms = verdict.verifyMs;
  if (verdict.passed) {
    task.status = "done";
    task.passes = true;
    task.finished_at = verdict.now.toISOString();
    task.active_ms = task.started_at ? verdict.now.getTime() - Date.parse(task.started_at) : null;
    return next;
  }
  task.retries += 1;
  if (task.retries >= PARK_AFTER) {
    task.status = "parked";
    task.finished_at = verdict.now.toISOString();
  }
  return next;
}

/** 마감을 막는 것들. 비어 있으면 마감할 수 있다. */
export function finishBlockers(ledger: Ledger): string[] {
  return ledger.tasks
    .filter((task) => task.status !== "done" && task.status !== "parked")
    .map((task) => `${task.id} (${task.status}) ${task.title}`);
}

export function outcome(ledger: Ledger, now: Date): Outcome {
  const starts = ledger.tasks
    .map((task) => task.started_at)
    .filter((at): at is string => at !== null)
    .map((at) => Date.parse(at));
  const first = starts.length > 0 ? Math.min(...starts) : now.getTime();
  return {
    issue: ledger.issue,
    title: ledger.title,
    finished_at: now.toISOString(),
    lead_time_ms: now.getTime() - first,
    active_ms: ledger.tasks.reduce((sum, task) => sum + (task.active_ms ?? 0), 0),
    prd_times: prdTimesOf(ledger),
    tasks: ledger.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      scope: task.scope,
      status: task.status,
      retries: task.retries,
      active_ms: task.active_ms,
      verify_ms: task.verify_ms,
    })),
  };
}

/** 다음에 집을 수 있는 작업: `todo` 이고 의존성이 모두 `done`. */
export function nextTask(ledger: Ledger): LedgerTask | null {
  const done = new Set(ledger.tasks.filter((t) => t.status === "done").map((t) => t.id));
  return ledger.tasks.find((t) => t.status === "todo" && t.depends_on.every((dep) => done.has(dep))) ?? null;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}초`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분`;
  }
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}
