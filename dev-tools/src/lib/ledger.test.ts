import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { deriveVerify, type RepoProbe, unitDir, wantsTdd } from "./actions.ts";
import {
  extend,
  finishBlockers,
  formatDuration,
  type Ledger,
  nextTask,
  type Outcome,
  outcome,
  PARK_AFTER,
  prdTimesOf,
  recordRed,
  recordVerdict,
  scaffold,
  startTask,
} from "./ledger.ts";
import type { Prd } from "./prd.ts";
import { ledgerLockPath, listLedgers, readLedger, updateLedger, withLedgerLock, writeLedger } from "./repo.ts";

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
  times: {
    drafted_at: "2026-10-12T01:00:00Z",
    submitted_at: "2026-10-12T01:40:00Z",
    approved_at: "2026-10-12T02:30:00Z",
  },
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

test("원장은 PRD 머리말의 세 시각을 싣고, 마감한 실측이 그대로 옮긴다", () => {
  const ledger = fresh();
  assert.deepEqual(ledger.prd_times, prd.times);
  const record = outcome(ledger, at(30));
  assert.deepEqual(record.prd_times, prd.times);
  // 일부만 있는 시각도 그대로 옮긴다(초안 없이 바로 올린 PRD).
  const direct = scaffold(
    { ...prd, times: { drafted_at: "2026-10-12T01:00:00Z", submitted_at: null, approved_at: "2026-10-12T02:00:00Z" } },
    { prdFile: "x.md", now: at(0), probe, tddAreas },
  );
  assert.deepEqual(outcome(direct, at(5)).prd_times, {
    drafted_at: "2026-10-12T01:00:00Z",
    submitted_at: null,
    approved_at: "2026-10-12T02:00:00Z",
  });
});

test("세 시각이 없는 옛 원장과 옛 실측 행은 모두 null 로 읽는다", () => {
  const none = { drafted_at: null, submitted_at: null, approved_at: null };
  const { prd_times: _dropped, ...old } = fresh();
  const oldLedger = JSON.parse(JSON.stringify(old)) as Ledger;
  assert.deepEqual(prdTimesOf(oldLedger), none);
  assert.deepEqual(outcome(oldLedger, at(30)).prd_times, none);
  const oldRow = JSON.parse(
    '{"issue":3,"title":"옛 이슈","finished_at":"2026-10-01T00:00:00.000Z","lead_time_ms":1,"active_ms":1,"tasks":[]}',
  ) as Outcome;
  assert.deepEqual(prdTimesOf(oldRow), none);
  // 있는 칸은 그대로 읽는다.
  assert.deepEqual(prdTimesOf(outcome(fresh(), at(30))), prd.times);
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

// 원장 파일과 잠금. 실제 파일 시스템의 임시 디렉터리에서 돈다.

function tempRoot(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(), "ledger-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** 작업 넷을 모두 집어 둔 원장. 동시에 판정받게 의존성은 없앤다. */
function doingLedger(): Ledger {
  let ledger = fresh();
  ledger.tasks[2]!.verify = ["true"];
  ledger.tasks[2]!.status = "todo";
  ledger.tasks.push({ ...ledger.tasks[0]!, id: "S4" });
  for (const task of ledger.tasks) {
    task.depends_on = [];
  }
  for (const id of ["S1", "S2", "S3", "S4"]) {
    ledger = startTask(ledger, id, at(1));
  }
  return ledger;
}

test("두 판정을 서로 다른 출발 사본에서 더해도 둘 다 남는다", (t) => {
  const root = tempRoot(t);
  writeLedger(root, doingLedger());
  // 두 러너가 검증 전에 같은 원장을 읽는다.
  const first = readLedger(root, 7);
  const second = readLedger(root, 7);
  assert.equal(first.tasks[0]!.status, "doing");
  assert.equal(second.tasks[1]!.status, "doing");
  // 검증이 끝난 순서대로 최신 원장에 자기 판정만 더한다.
  updateLedger(root, 7, (latest) => recordVerdict(latest, "S1", { passed: true, verifyMs: 1, now: at(5) }));
  updateLedger(root, 7, (latest) => recordVerdict(latest, "S2", { passed: true, verifyMs: 1, now: at(6) }));
  const after = readLedger(root, 7);
  assert.equal(after.tasks.find((task) => task.id === "S1")!.status, "done");
  assert.equal(after.tasks.find((task) => task.id === "S2")!.status, "done");
  assert.equal(existsSync(ledgerLockPath(root, 7)), false);
});

const repoModule = new URL("./repo.ts", import.meta.url).href;
const ledgerModule = new URL("./ledger.ts", import.meta.url).href;

/** 자식 프로세스의 끝을 기다린다. 0 이 아니면 stderr 를 실어 던진다. */
function exited(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`자식 프로세스 실패 (${code}): ${stderr}`))));
  });
}

/** 다른 프로세스에서 `updateLedger` 를 `times` 번 부른다. 잠금 안에서 일부러 쉬어 겹칠 틈을 넓힌다. */
function failRepeatedly(root: string, taskId: string, times: number): Promise<void> {
  const script = `
    import { updateLedger } from ${JSON.stringify(repoModule)};
    import { recordVerdict } from ${JSON.stringify(ledgerModule)};
    const [root, taskId, times] = process.argv.slice(1);
    const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    for (let i = 0; i < Number(times); i += 1) {
      updateLedger(root, 7, (ledger) => {
        pause();
        return recordVerdict(ledger, taskId, { passed: false, verifyMs: 1, now: new Date() });
      });
    }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, root, taskId, String(times)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return exited(child);
}

test("잠금은 여러 프로세스의 읽고 고치고 쓰기를 차례로 세운다", async (t) => {
  const root = tempRoot(t);
  writeLedger(root, doingLedger());
  const times = PARK_AFTER - 2;
  await Promise.all(["S1", "S2", "S3", "S4"].map((id) => failRepeatedly(root, id, times)));
  const after = readLedger(root, 7);
  // 잃어버린 쓰기가 하나라도 있으면 어느 작업의 실패 횟수가 모자란다.
  assert.deepEqual(
    after.tasks.map((task) => [task.id, task.retries]),
    [
      ["S1", times],
      ["S2", times],
      ["S3", times],
      ["S4", times],
    ],
  );
  assert.equal(existsSync(ledgerLockPath(root, 7)), false);
});

test("extend 가 잠금을 쥔 동안 다른 쓰기가 기다리고, 둘 다 남는다", async (t) => {
  const root = tempRoot(t);
  const base = doingLedger();
  writeLedger(root, base);
  // PRD 에 S5 를 더해 다시 만든 원장. 이미 있던 작업의 판정은 extend 가 옛 원장에서 옮긴다.
  const fresh: Ledger = {
    ...base,
    tasks: [...base.tasks, { ...base.tasks[0]!, id: "S5", status: "todo", started_at: null }],
  };
  const freshFile = join(root, "fresh.json");
  writeFileSync(freshFile, JSON.stringify(fresh));
  const inside = join(root, "inside");
  const script = `
    import { readFileSync, writeFileSync } from "node:fs";
    import { placeLedger } from ${JSON.stringify(repoModule)};
    import { extend } from ${JSON.stringify(ledgerModule)};
    const [root, freshFile, inside] = process.argv.slice(1);
    const fresh = JSON.parse(readFileSync(freshFile, "utf8"));
    placeLedger(root, fresh, {
      merge: (before) => {
        // 옛 원장을 읽은 뒤 쓰기 전까지 일부러 쉰다. 잠금이 없으면 그 사이의 다른 쓰기를 덮는다.
        writeFileSync(inside, "");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
        return extend(before, fresh);
      },
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, root, freshFile, inside], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const done = exited(child);
  const deadline = Date.now() + 10_000;
  while (!existsSync(inside)) {
    assert.ok(Date.now() < deadline, "자식 프로세스가 잠금 안에 들어가지 못했습니다");
    await delay(5);
  }
  const started = Date.now();
  updateLedger(root, 7, (latest) => recordVerdict(latest, "S1", { passed: true, verifyMs: 1, now: at(5) }));
  const waited = Date.now() - started;
  await done;
  // extend 가 잠금을 놓을 때까지 기다렸다가, 이어 붙인 원장 위에 판정을 더했다.
  assert.ok(waited >= 100, `잠금을 기다리지 않았습니다 (${waited}ms)`);
  const after = readLedger(root, 7);
  assert.deepEqual(
    after.tasks.map((task) => task.id),
    ["S1", "S2", "S3", "S4", "S5"],
  );
  assert.equal(after.tasks.find((task) => task.id === "S1")!.status, "done");
  assert.equal(after.tasks.find((task) => task.id === "S5")!.status, "todo");
  assert.equal(existsSync(ledgerLockPath(root, 7)), false);
});

test("원장 목록은 남이 쥔 잠금을 건너뛰지 않고 기다린다", (t) => {
  const root = tempRoot(t);
  writeLedger(root, doingLedger());
  writeFileSync(ledgerLockPath(root, 7), "99999\n");
  // 남이 잠금을 쥐고 있으면 반쪽 파일을 읽지 않고 기다리다 끝난다.
  assert.throws(() => listLedgers(root, { waitMs: 50, intervalMs: 10 }), /잠금/);
  rmSync(ledgerLockPath(root, 7));
  assert.deepEqual(
    listLedgers(root).map((ledger) => ledger.issue),
    [7],
  );
  assert.equal(existsSync(ledgerLockPath(root, 7)), false);
});

test("죽은 프로세스가 남긴 잠금이 있으면 기다린 뒤 오류로 끝나고 잠금을 지우지 않는다", (t) => {
  const root = tempRoot(t);
  writeLedger(root, doingLedger());
  writeFileSync(ledgerLockPath(root, 7), "99999\n");
  let ran = false;
  const started = Date.now();
  assert.throws(
    () =>
      updateLedger(
        root,
        7,
        (latest) => {
          ran = true;
          return latest;
        },
        { waitMs: 100, intervalMs: 10 },
      ),
    /잠금 파일을 지우고 다시 시도하세요/,
  );
  assert.ok(Date.now() - started >= 100);
  assert.equal(ran, false);
  assert.equal(existsSync(ledgerLockPath(root, 7)), true);
});

test("잠금 안의 일이 던져도 잠금은 풀린다", (t) => {
  const root = tempRoot(t);
  writeLedger(root, doingLedger());
  assert.throws(
    () => updateLedger(root, 7, (latest) => recordVerdict(latest, "S9", { passed: true, verifyMs: 1, now: at(2) })),
    /S9/,
  );
  assert.equal(existsSync(ledgerLockPath(root, 7)), false);
  assert.equal(
    withLedgerLock(root, 7, () => "다시 얻음"),
    "다시 얻음",
  );
});
