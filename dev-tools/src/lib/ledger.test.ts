import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveVerify, type RepoProbe, unitDir, wantsTdd } from "./actions.ts";
import {
  extend,
  finishBlockers,
  formatDuration,
  nextTask,
  outcome,
  PARK_AFTER,
  recordRed,
  recordVerdict,
  scaffold,
  startTask,
} from "./ledger.ts";
import type { Prd } from "./prd.ts";

const probe: RepoProbe = {
  nodePackage: (dir) => {
    if (dir === "apps/api") {
      return { name: "@example/api", scripts: ["typecheck", "test"] };
    }
    if (dir === "apps/admin") {
      return { name: "@example/admin", scripts: ["dev", "typecheck"] };
    }
    if (dir === "dev-tools") {
      return { name: "@example/dev-tools", scripts: ["typecheck", "test"] };
    }
    return null;
  },
};

const prd: Prd = {
  issue: 7,
  title: "예시",
  file: "7-example.md",
  dependsOn: [],
  scopePaths: ["apps/api", "docs"],
  tasks: [
    { id: "S1", title: "첫째", scope: ["apps/api/src/spec.ts"], dependsOn: [], verify: [], tdd: false },
    { id: "S2", title: "둘째", scope: ["apps/api/src/jobs.ts"], dependsOn: ["S1"], verify: [], tdd: false },
    { id: "S3", title: "문서", scope: ["docs/notes.md"], dependsOn: [], verify: [], tdd: null },
  ],
};

const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 3, minute));
const tddAreas = ["apps"];
const fresh = () => scaffold(prd, { prdFile: "docs/prd/7-example.md", now: at(0), probe, tddAreas });

test("범위가 속한 패키지에서 검증 명령을 끌어낸다", () => {
  assert.deepEqual(deriveVerify(["apps/api/src/spec.ts"], probe), [
    "pnpm -F @example/api typecheck",
    "pnpm -F @example/api test",
  ]);
  assert.deepEqual(deriveVerify(["apps/admin/src/App.tsx"], probe), ["pnpm -F @example/admin typecheck"]);
  assert.deepEqual(deriveVerify(["dev-tools/src/cli.ts"], probe), [
    "pnpm -F @example/dev-tools typecheck",
    "pnpm -F @example/dev-tools test",
  ]);
  // 같은 패키지의 두 파일은 명령 둘(typecheck, test)을 한 번씩만 건다.
  assert.deepEqual(deriveVerify(["apps/api/src/a.ts", "apps/api/src/b.ts"], probe), [
    "pnpm -F @example/api typecheck",
    "pnpm -F @example/api test",
  ]);
});

test("아직 없는 패키지는 넓게 걸고, 패키지 밖은 지어내지 않는다", () => {
  assert.deepEqual(deriveVerify(["apps/web/src/main.tsx"], probe), ["pnpm test"]);
  assert.deepEqual(deriveVerify(["packages/shared/src/index.ts"], probe), ["pnpm test"]);
  assert.deepEqual(deriveVerify(["docs/notes.md", "CLAUDE.md", ".claude/skills/prd"], probe), []);
  assert.equal(unitDir("./packages/shared/src/index.ts"), "packages/shared");
  assert.equal(unitDir("dev-tools-old/x"), null);
});

test("원장을 만들면 검증이 없는 작업만 needs_spec 이다", () => {
  const ledger = fresh();
  assert.equal(ledger.issue, 7);
  assert.deepEqual(
    ledger.tasks.map((t) => t.status),
    ["todo", "todo", "needs_spec"],
  );
  assert.ok(ledger.tasks.every((t) => !t.passes && t.retries === 0 && t.started_at === null));
});

test("이슈로 올리지 않은 초안으로는 원장을 만들 수 없다", () => {
  assert.throws(() => scaffold({ ...prd, issue: null }, { prdFile: "x.md", now: at(0), probe, tddAreas }), /prd:push/);
});

test("PRD 표에 적은 검증 명령이 끌어낸 것보다 앞선다", () => {
  const custom: Prd = { ...prd, tasks: [{ ...prd.tasks[2]!, verify: ["test -f docs/notes.md"] }] };
  const ledger = scaffold(custom, { prdFile: "x.md", now: at(0), probe, tddAreas });
  assert.deepEqual(ledger.tasks[0]!.verify, ["test -f docs/notes.md"]);
  assert.equal(ledger.tasks[0]!.status, "todo");
});

test("작업을 집으면 doing 이 되고 받은 원장은 그대로다", () => {
  const before = fresh();
  const after = startTask(before, "S1", at(1));
  assert.equal(after.tasks[0]!.status, "doing");
  assert.equal(after.tasks[0]!.started_at, at(1).toISOString());
  assert.equal(before.tasks[0]!.status, "todo");
  // 다시 집어도 시작 시각은 바뀌지 않는다.
  assert.equal(startTask(after, "S1", at(9)).tasks[0]!.started_at, at(1).toISOString());
});

test("의존성이 끝나지 않았거나 검증이 없는 작업은 집을 수 없다", () => {
  assert.throws(() => startTask(fresh(), "S2", at(1)), /먼저 끝나야/);
  assert.throws(() => startTask(fresh(), "S3", at(1)), /검증 명령이 없습니다/);
  assert.throws(() => startTask(fresh(), "S9", at(1)), /원장에 없습니다/);
});

test("검증을 통과하면 done 이 되고 걸린 시간이 남는다", () => {
  const doing = startTask(fresh(), "S1", at(1));
  const done = recordVerdict(doing, "S1", { passed: true, verifyMs: 800, now: at(11) });
  const task = done.tasks[0]!;
  assert.equal(task.status, "done");
  assert.equal(task.passes, true);
  assert.equal(task.active_ms, 10 * 60_000);
  assert.equal(task.verify_ms, 800);
  assert.equal(nextTask(done)?.id, "S2");
  assert.throws(() => startTask(done, "S1", at(12)), /이미 done/);
});

test("집지 않은 작업에는 판정을 적을 수 없다", () => {
  assert.throws(() => recordVerdict(fresh(), "S1", { passed: true, verifyMs: 1, now: at(1) }), /먼저 집으세요/);
});

test("실패가 쌓이면 parked 가 된다", () => {
  let ledger = startTask(fresh(), "S1", at(1));
  for (let i = 1; i < PARK_AFTER; i += 1) {
    ledger = recordVerdict(ledger, "S1", { passed: false, verifyMs: 1, now: at(1 + i) });
    assert.equal(ledger.tasks[0]!.status, "doing");
    assert.equal(ledger.tasks[0]!.retries, i);
  }
  ledger = recordVerdict(ledger, "S1", { passed: false, verifyMs: 1, now: at(9) });
  assert.equal(ledger.tasks[0]!.status, "parked");
  assert.equal(ledger.tasks[0]!.passes, false);
});

test("끝나지 않은 작업이 있으면 마감을 막는다", () => {
  let ledger = fresh();
  assert.equal(finishBlockers(ledger).length, 3);
  ledger.tasks[2]!.verify = ["true"];
  ledger.tasks[2]!.status = "todo";
  for (const [i, id] of ["S1", "S2", "S3"].entries()) {
    ledger = startTask(ledger, id, at(10 * i));
    ledger = recordVerdict(ledger, id, { passed: true, verifyMs: 5, now: at(10 * i + 4) });
  }
  assert.deepEqual(finishBlockers(ledger), []);
  assert.equal(nextTask(ledger), null);

  const record = outcome(ledger, at(30));
  assert.equal(record.issue, 7);
  assert.equal(record.active_ms, 3 * 4 * 60_000);
  assert.equal(record.lead_time_ms, 30 * 60_000);
  assert.equal(record.tasks.length, 3);
});

test("시간 표기", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(42_000), "42초");
  assert.equal(formatDuration(5 * 60_000), "5분");
  assert.equal(formatDuration(135 * 60_000), "2시간 15분");
});

const tddPrd: Prd = { ...prd, tasks: [{ ...prd.tasks[0]!, tdd: null }] };
const tddFresh = () => scaffold(tddPrd, { prdFile: "x.md", now: at(0), probe, tddAreas });

test("테스트를 먼저 쓰는 영역은 설정의 tddAreas 다", () => {
  assert.equal(wantsTdd(["apps/api/src/spec.ts"], tddAreas), true);
  assert.equal(wantsTdd(["apps/web/src/main.tsx"], tddAreas), true);
  assert.equal(wantsTdd(["./apps/admin"], tddAreas), true);
  assert.equal(wantsTdd(["appsx/src/main.tsx"], tddAreas), false);
  assert.equal(wantsTdd(["infra/index.ts", "dev-tools/src/cli.ts", "docs/notes.md"], tddAreas), false);
  // 영역을 좁히면 그 밖은 아니다. 끝의 `/` 는 따지지 않는다.
  assert.equal(wantsTdd(["apps/api/src/spec.ts"], ["apps/web/"]), false);
  assert.equal(wantsTdd(["apps/web/src/main.tsx"], ["apps/web/"]), true);
  assert.equal(wantsTdd(["apps/admin"], ["apps/admin/"]), true);
  assert.equal(wantsTdd(["apps/adminx/src/main.tsx"], ["apps/admin"]), false);
  // PRD 표에 적은 값이 범위보다 앞선다.
  assert.equal(tddFresh().tasks[0]!.tdd, true);
  assert.equal(fresh().tasks[0]!.tdd, false);
});

test("테스트를 먼저 쓰는 작업은 실패를 기록해야 판정을 받는다", () => {
  const doing = startTask(tddFresh(), "S1", at(1));
  assert.throws(() => recordVerdict(doing, "S1", { passed: true, verifyMs: 1, now: at(2) }), /ledger:red/);
  // 통과하는 검증은 실패로 기록되지 않는다.
  assert.throws(() => recordRed(doing, "S1", { failed: false, now: at(2) }), /실패하는 테스트를 먼저/);
  const red = recordRed(doing, "S1", { failed: true, now: at(2) });
  assert.equal(red.tasks[0]!.red_at, at(2).toISOString());
  assert.equal(red.tasks[0]!.retries, 0);
  assert.throws(() => recordRed(red, "S1", { failed: true, now: at(3) }), /이미 기록/);
  assert.equal(recordVerdict(red, "S1", { passed: true, verifyMs: 1, now: at(5) }).tasks[0]!.status, "done");
});

test("테스트를 먼저 쓰지 않는 작업에는 실패를 기록하지 않는다", () => {
  assert.throws(() => recordRed(startTask(fresh(), "S1", at(1)), "S1", { failed: true, now: at(2) }), /아닙니다/);
});

test("원장을 이으면 끝난 작업의 판정은 남고 새 작업만 todo 로 붙는다", () => {
  let ledger = startTask(fresh(), "S1", at(1));
  ledger = recordVerdict(ledger, "S1", { passed: true, now: at(5), verifyMs: 900 });
  const longer: Prd = {
    ...prd,
    title: "예시 (연장)",
    tasks: [
      { ...prd.tasks[0]!, title: "첫째 (고친 제목)" },
      ...prd.tasks.slice(1),
      { id: "S4", title: "넷째", scope: ["apps/api/src/models.ts"], dependsOn: ["S1"], verify: [], tdd: false },
    ],
  };
  const extended = extend(ledger, scaffold(longer, { prdFile: "docs/prd/7-example.md", now: at(9), probe, tddAreas }));
  const first = extended.tasks.find((task) => task.id === "S1")!;
  assert.equal(first.status, "done");
  assert.equal(first.passes, true);
  assert.equal(first.active_ms, ledger.tasks[0]!.active_ms);
  assert.equal(first.title, "첫째 (고친 제목)");
  assert.equal(extended.tasks.find((task) => task.id === "S4")!.status, "todo");
  assert.equal(extended.title, "예시 (연장)");
  assert.equal(extended.created_at, ledger.created_at);
});

test("판정이 내려진 작업이 PRD 에서 빠지면 원장을 잇지 않는다", () => {
  const shorter: Prd = { ...prd, tasks: prd.tasks.slice(1) };
  assert.throws(
    () => extend(fresh(), scaffold(shorter, { prdFile: "docs/prd/7-example.md", now: at(9), probe, tddAreas })),
    /S1/,
  );
});
