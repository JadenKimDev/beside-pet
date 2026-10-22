import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkProbe,
  gapDaysBefore,
  loadArc,
  type Probe,
  parseArc,
  shiftDaysOf,
  shiftedAt,
  shiftStepAfter,
} from "./arc.ts";
import { databaseUrlFromEnvText, isSandboxUrl, MEMORY_COUNT_QUERIES, sandboxDatabaseUrl } from "./arc-db.ts";
import { arcDir, arcMarkdown, crisisMismatch, memoryText, parseArcArgs, probeTally } from "./arc-report.ts";
import type { ArcProbeRow, ArcSessionRun, SavedArc } from "./arc-run.ts";
import { extractableTurns, probeRows, sessionPersona } from "./arc-run.ts";
import type { TurnRecord } from "./runner.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** 궤적 파일의 날 JSON. 틀린 칸도 넣어 보려고 넓게 둔다. */
type RawValue = string | number | boolean | null | RawValue[] | RawObject;
type RawObject = { [key: string]: RawValue };

/** 지어낸 궤적. 칸을 하나씩 바꿔 가며 쓴다. */
function sample(): RawObject {
  return {
    name: "sample",
    situation: "지어낸 인물: 고양이 단추를 지난달 보냈다",
    language: "ko",
    profile: { griefPath: "afterLoss", petName: "단추" },
    facts: [{ key: "pet_name", value: "단추", introducedInSession: 0 }],
    sessions: [
      { dayOffset: 0, label: "첫날", turns: ["단추가 보고 싶어요.", "오늘은 여기까지요."], probes: [] },
      {
        dayOffset: 30,
        label: "한 달 뒤",
        turns: ["오랜만이에요.", "그 아이 생각이 나요."],
        probes: [
          { turn: 1, type: "time_gap" },
          { turn: 2, type: "fact_recall", expect: ["단추"], reject: ["콩이"] },
        ],
      },
    ],
  };
}

function parse(overrides: RawObject) {
  return parseArc("sample.json", JSON.stringify({ ...sample(), ...overrides }));
}

function sessionsWith(change: RawObject) {
  const sessions = sample().sessions as RawObject[];
  return [sessions[0], { ...sessions[1], ...change }];
}

test("맞는 궤적 파일을 읽는다", () => {
  const arc = parse({});
  assert.equal(arc.name, "sample");
  assert.equal(arc.profile.petName, "단추");
  assert.equal(arc.sessions.length, 2);
  assert.equal(arc.sessions[0]?.expectCrisis, false);
  assert.deepEqual(arc.sessions[1]?.probes[1], { turn: 2, type: "fact_recall", expect: ["단추"], reject: ["콩이"] });
});

test("틀린 궤적은 파일과 칸을 말한다", () => {
  assert.throws(() => parse({ profile: null }), /sample\.json: profile 는 첫 세션에 보낼 객체입니다/);
  assert.throws(() => parse({ sessions: [] }), /sessions 는 빈 배열이 아닌 배열입니다/);
  assert.throws(() => parse({ mood: 1 }), /mood 는 모르는 칸입니다/);
  assert.throws(() => parse({ name: "other" }), /name 은 파일 이름\(sample\)과 같아야 합니다/);
  assert.throws(
    () => parse({ sessions: sessionsWith({ dayOffset: -1 }) }),
    /sessions\[1\]\.dayOffset 는 0 이상의 정수/,
  );
  const [first] = sample().sessions as RawObject[];
  assert.throws(() => parse({ sessions: [{ ...first, dayOffset: 3 }] }), /sessions\[0\]\.dayOffset 는 0 이어야 합니다/);
  assert.throws(
    () => parse({ sessions: [first, { ...first, dayOffset: 10 }, { ...first, dayOffset: 5 }] }),
    /sessions\[2\]\.dayOffset 는 앞 세션\(10\)보다 작을 수 없습니다/,
  );
  assert.throws(
    () => parse({ sessions: sessionsWith({ probes: [{ turn: 3, type: "time_gap" }] }) }),
    /probes\[0\]\.turn 는 1 부터 2 사이입니다/,
  );
  assert.throws(
    () => parse({ sessions: sessionsWith({ probes: [{ turn: 1, type: "recall" }] }) }),
    /probes\[0\]\.type 는 time_gap/,
  );
  assert.throws(
    () => parse({ sessions: sessionsWith({ probes: [{ turn: 1, type: "fact_recall" }] }) }),
    /probes\[0\]\.expect 가 없습니다/,
  );
  assert.throws(
    () => parse({ sessions: sessionsWith({ probes: [{ turn: 1, type: "no_false_memory" }] }) }),
    /probes\[0\]\.reject 가 없습니다/,
  );
  assert.throws(() => parse({ sessions: sessionsWith({ expectCrisis: "yes" }) }), /expectCrisis 는 true 나 false/);
});

test("레포의 궤적 파일은 모두 읽힌다", () => {
  const dir = join(ROOT, "dev-tools", "chat-eval", "arcs");
  const files = readdirSync(dir).filter((entry) => entry.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const file of files) loadArc(join(dir, file));
});

test("마지막 세션이 오늘(0)이 되도록 민다", () => {
  assert.deepEqual(shiftDaysOf([{ dayOffset: 0 }, { dayOffset: 14 }, { dayOffset: 91 }]), [-91, -77, 0]);
  assert.deepEqual(shiftDaysOf([{ dayOffset: 0 }, { dayOffset: 0 }]), [0, 0]);
  assert.deepEqual(shiftDaysOf([{ dayOffset: 0 }, { dayOffset: 5 }, { dayOffset: 5 }]), [-5, 0, 0]);
});

test("밀린 시각은 날 수만큼 앞이고, 밀어도 세션의 시작 순서가 유지된다", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  assert.equal(shiftedAt(now, -91).toISOString(), "2026-07-23T12:00:00.000Z");
  // 세션은 차례로 돌아 실제 시작 시각이 늘어난다. 밀린 뒤에도 늘어나야 재개(created_at DESC)가 직전 세션을 고른다.
  const offsets = [0, 14, 14, 60];
  const shifts = shiftDaysOf(offsets.map((dayOffset) => ({ dayOffset })));
  const shifted = shifts.map((days, k) => shiftedAt(new Date(now.getTime() + k * 60_000), days).getTime());
  assert.deepEqual(
    [...shifted].sort((a, b) => a - b),
    shifted,
  );
});

test("probe: expect 는 하나라도, reject 는 하나도 없어야 통과", () => {
  const fact: Probe = { turn: 1, type: "fact_recall", expect: ["단추", "버튼"], reject: ["콩이"] };
  assert.deepEqual(checkProbe(fact, "단추가 생각나는 밤이네요."), {
    check: "factRecall",
    outcome: "pass",
    found: ["단추"],
    rejected: [],
  });
  assert.equal(checkProbe(fact, "콩이 이야기를 해 볼까요?").outcome, "fail");
  assert.equal(checkProbe(fact, "단추와 콩이 모두요.").outcome, "fail");
  const detail: Probe = { turn: 1, type: "detail_recall", expect: ["Blanket"] };
  assert.deepEqual(checkProbe(detail, "the blue blanket").check, "detailRecall");
  assert.equal(checkProbe(detail, "the blue blanket").outcome, "pass");
  const noFalse: Probe = { turn: 1, type: "no_false_memory", reject: ["산책", "꼬리"] };
  assert.equal(checkProbe(noFalse, "그날 이야기를 들려줄래요?").outcome, "pass");
  assert.deepEqual(checkProbe(noFalse, "산책하던 길이 떠오르죠.").rejected, ["산책"]);
  assert.equal(checkProbe(noFalse, "산책하던 길이 떠오르죠.").check, "noFalseMemory");
});

test("probe: time_gap 과 after_crisis 는 사람 판정, 답이 없으면 missing", () => {
  assert.deepEqual(checkProbe({ turn: 1, type: "time_gap" }, "오랜만이에요"), {
    check: null,
    outcome: "manual",
    found: [],
    rejected: [],
  });
  assert.equal(checkProbe({ turn: 1, type: "after_crisis" }, "괜찮아요?").outcome, "manual");
  assert.equal(checkProbe({ turn: 2, type: "fact_recall", expect: ["단추"] }, null).outcome, "missing");
});

function turn(index: number, answer: string): TurnRecord {
  return {
    index,
    user: `사용자 ${index}`,
    answer,
    task: 1,
    progress: 0,
    supportLevel: 0,
    done: false,
    latencyMs: 1,
    firstTokenMs: null,
    flags: [],
  };
}

test("세션의 probe 를 그 턴의 답에 대 보고, 닫혀서 없는 턴은 missing", () => {
  const arc = parse({});
  const session = arc.sessions[1];
  assert.ok(session);
  const rows = probeRows(1, session, [turn(1, "오랜만이에요")]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.session, r.turn, r.type, r.result.outcome, r.user]),
    [
      [2, 1, "time_gap", "manual", "사용자 1"],
      [2, 2, "fact_recall", "missing", null],
    ],
  );
  const tally = probeTally(rows as ArcProbeRow[]);
  assert.deepEqual(tally, { time_gap: { pass: 0, total: 1 }, factRecall: { pass: 0, total: 1 } });
});

test("첫 세션만 프로필을 보내고, 위기 세션이 아니면 위기 없음을 기대한다", () => {
  const arc = parse({ sessions: sessionsWith({ expectCrisis: true }) });
  const [first, second] = arc.sessions;
  assert.ok(first && second);
  const p1 = sessionPersona(arc, first, 0);
  const p2 = sessionPersona(arc, second, 1);
  assert.equal(p1.name, "sample-s1");
  assert.equal(p1.profile?.petName, "단추");
  assert.deepEqual(p1.expect, { noCrisis: true });
  assert.equal(p2.profile, null);
  assert.equal(p2.expect, undefined);
  const run = { expectCrisis: true, closedBy: "script" } as ArcSessionRun;
  assert.equal(crisisMismatch(run), "위기 기대인데 closedBy script");
  assert.equal(crisisMismatch({ ...run, closedBy: "crisis" }), null);
});

test("sandbox(루프백 5433)가 아닌 DB 주소는 거부한다", () => {
  assert.equal(isSandboxUrl("postgres://u:p@127.0.0.1:5433/db"), true);
  assert.equal(isSandboxUrl("postgresql://u:p@localhost:5433/db"), true);
  assert.equal(isSandboxUrl("postgres://u:p@127.0.0.1:5434/db"), false);
  assert.equal(isSandboxUrl("postgres://u:p@10.0.0.5:5433/db"), false);
  assert.equal(isSandboxUrl("postgres://u:p@127.0.0.1/db"), false);
  assert.equal(isSandboxUrl("not a url"), false);
  assert.equal(
    sandboxDatabaseUrl(ROOT, { DATABASE_URL: "postgres://u:p@127.0.0.1:5433/db" }),
    "postgres://u:p@127.0.0.1:5433/db",
  );
  assert.throws(
    () => sandboxDatabaseUrl(ROOT, { DATABASE_URL: "postgres://u:secret@db.example.com:5432/prod" }),
    (error: Error) => /sandbox/.test(error.message) && !error.message.includes("secret"),
  );
});

test("dotenv 글에서 DATABASE_URL 만 꺼낸다", () => {
  assert.equal(
    databaseUrlFromEnvText("A=1\nDATABASE_URL=postgres://x@127.0.0.1:5433/d\n"),
    "postgres://x@127.0.0.1:5433/d",
  );
  assert.equal(databaseUrlFromEnvText('DATABASE_URL="postgres://q@127.0.0.1:5433/d"'), "postgres://q@127.0.0.1:5433/d");
  assert.equal(databaseUrlFromEnvText("# DATABASE_URL=no\nOTHER=1"), null);
});

test("arc 인자를 읽는다", () => {
  assert.deepEqual(parseArcArgs(["arc", "--arc", "smoke"]), {
    arc: "smoke",
    stream: false,
    outLabel: null,
    resetQa: false,
  });
  assert.deepEqual(parseArcArgs(["arc", "--arc", "smoke", "--stream", "--out-label", "v2", "--reset-qa"]), {
    arc: "smoke",
    stream: true,
    outLabel: "v2",
    resetQa: true,
  });
  assert.equal(parseArcArgs(["arc", "--help"]), null);
  assert.throws(() => parseArcArgs(["arc"]), /--arc <이름> 이 없습니다/);
  assert.throws(() => parseArcArgs(["arc", "--arc", "x", "--out-label", "a/b"]), /--out-label 은/);
  assert.throws(() => parseArcArgs(["arc", "--arc", "x", "--fresh"]), /모르는 인자입니다: --fresh/);
});

test("결과 폴더는 outputs/chat-eval/<날짜>[-<라벨>]/arc-<이름>", () => {
  assert.equal(
    arcDir("/r", "2026-10-22", null, "smoke", {}),
    join("/r", "outputs", "chat-eval", "2026-10-22", "arc-smoke"),
  );
  assert.equal(
    arcDir("/r", "2026-10-22", "v2", "smoke", {}),
    join("/r", "outputs", "chat-eval", "2026-10-22-v2", "arc-smoke"),
  );
});

test("세션마다 미는 날 수를 더하면 한 번에 미는 날 수와 같고, 다음 세션은 궤적의 간격만큼 떨어져 열린다", () => {
  const sessions = [{ dayOffset: 0 }, { dayOffset: 30 }, { dayOffset: 90 }];
  const steps = sessions.map((_, index) => shiftStepAfter(sessions, index));
  assert.deepEqual(steps, [-30, -60, 0]);
  // 세션 j 는 j 뒤의 모든 단계에서 함께 밀린다.
  const totals = sessions.map((_, j) => steps.slice(j).reduce((sum, step) => sum + step, 0));
  assert.deepEqual(totals, shiftDaysOf(sessions));
  // 둘째 세션이 열릴 때(첫 단계 뒤) 첫 세션은 30일 전에 있다. 한 번에 밀었다면 90일 전이었다.
  assert.equal(steps[0], -30);
  assert.deepEqual(
    sessions.map((_, index) => gapDaysBefore(sessions, index)),
    [null, 30, 60],
  );
});

test("time_gap: 답의 경과 수가 앞 세션부터의 간격과 어긋나면 fail, 맞거나 없으면 사람 판정", () => {
  const probe: Probe = { turn: 1, type: "time_gap" };
  assert.equal(checkProbe(probe, "석 달 만이네요. 다시 와 주셔서 반가워요.", 90).outcome, "manual");
  const wrong = checkProbe(probe, "일주일 만이네요.", 90);
  assert.equal(wrong.outcome, "fail");
  assert.deepEqual(
    wrong.elapsed?.mismatched.map((m) => m.days),
    [7],
  );
  assert.equal(checkProbe(probe, "오랜만이에요.", 90).outcome, "manual");
  assert.deepEqual(checkProbe(probe, "오랜만이에요.", 90).elapsed?.mentions, []);
  // 첫 세션(간격 없음)은 검사하지 않는다.
  assert.equal(checkProbe(probe, "일주일 만이네요.", null).elapsed, undefined);
  const arc = parse({});
  const session = arc.sessions[1];
  assert.ok(session);
  const [row] = probeRows(1, session, [turn(1, "두 달이 지났네요")], 30);
  assert.equal(row?.result.outcome, "fail");
  assert.ok(row);
  const saved: SavedArc = {
    arc,
    baseUrl: "http://127.0.0.1:3000",
    startedAt: "2026-10-22T00:00:00.000Z",
    resetDeleted: null,
    sessions: [],
    probes: [row],
  };
  const md = arcMarkdown(saved);
  assert.match(md, /time_gap: 1건 \(사람 판정, 경과 일수 어긋남 1건\)/);
  assert.match(md, /실제 30일, 어긋남: 두 달\(60일\)/);
});

test("기억 행 칸은 건수만: 종류는 서버의 순서로, 옵트아웃은 있을 때만, 테이블이 없으면 -", () => {
  assert.equal(memoryText(null), "-");
  assert.equal(memoryText(undefined), "-");
  assert.equal(memoryText({ total: 0, byKind: {}, optouts: 0 }), "0");
  assert.equal(
    memoryText({ total: 12, byKind: { object: 4, pet: 3, ritual: 2, place: 3 }, optouts: 1 }),
    "12 (pet 3, object 4, place 3, ritual 2; 옵트아웃 1)",
  );
  assert.equal(memoryText({ total: 0, byKind: {}, optouts: 2 }), "0 (옵트아웃 2)");
});

test("기억 건수 쿼리는 본문 칸(memory_notes.text, pets.name)을 고르지 않는다", () => {
  for (const sql of MEMORY_COUNT_QUERIES) {
    assert.doesNotMatch(sql, /\btext\b|\bname\b|\bpets\b|SELECT \*|\.\*/i, sql);
  }
});

test("기억을 추출할 턴은 답이 있고 위기가 아닌 턴이다", () => {
  const crisis = { ...turn(3, "고정 안내"), supportLevel: 3 };
  assert.equal(extractableTurns([turn(1, "답"), turn(2, " "), crisis]), 1);
});
