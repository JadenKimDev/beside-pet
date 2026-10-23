// 작업 대장 CLI. 루트 `package.json` 의 스크립트가 이 파일을 부른다.
//
// PRD 의 이름은 GitHub 이슈 번호다. 작업 ID 는 그 PRD 안의 짧은 이름(S1, S2)이다.
//
//   pnpm prd:push docs/prd/<파일>.md [--draft]   이슈를 만들거나 본문을 갱신하고 보드에 올린다. --draft 는 초안 라벨(prd:draft)을 붙여 번호부터 받는다
//   pnpm prd:pull <이슈>                    이슈 본문을 docs/prd/ 캐시로 받는다
//   pnpm ledger:new docs/prd/<파일>.md      PRD 에서 원장을 만든다
//   pnpm work <이슈> <작업>                 작업을 집는다
//   pnpm ledger:red <이슈> <작업>           테스트만 쓴 상태에서 검증이 실패하는 것을 기록한다
//   pnpm ledger:verify <이슈> <작업>        검증을 돌려 판정을 적는다
//   pnpm finish <이슈>                      마감: 결과를 기록하고 원장을 지운다
//   pnpm ledger:status [이슈]               진행 중인 원장
//   pnpm ledger:outcomes                    끝난 이슈의 실측
//   pnpm ledger:accuracy                    PRD 의 추정(낙관·현실·비관)과 실측을 맞대어 정확도를 잰다
//   pnpm docs:index                         결정 기록 색인(docs/docs.db)을 다시 만든다
//   pnpm docs:search "<낱말>"               결정 기록을 찾는다 (색인이 낡았으면 먼저 다시 만든다)
//   pnpm docs:list [--type adr|devlog] [--status <s>] [--tag <t>]   결정 기록 목록
//   pnpm docs:neighbors <id>                related 와 겹치는 태그로 이어진 글
//   (docs:* 넷 모두 --json 이면 결과를 JSON 으로 찍는다)
//   pnpm issue:label <이슈> [--add <라벨,...>] [--remove <라벨,...>]   라벨 붙이고 떼기 (없는 라벨은 만든다)
//   pnpm issue:comment <이슈> --file <마크다운>                       이슈에 댓글 하나
//   pnpm runner:report <이슈> --sha <sha> [--test-log <경로>] [--test-exit <코드>] [--qa <report.html>]   러너 결과 댓글을 stdout 에
//   pnpm chat:eval run (--persona <이름> | --all) [--interactive] [--stream] [--baseline <날짜>]   대화 실측
//   pnpm chat:eval arc --arc <이름> [--stream] [--out-label <라벨>] [--reset-qa]   장기기억 실측(세션 여럿, 날짜를 과거로 민다)

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { chatEval } from "./lib/chat-eval/command.ts";
import type { DocKind } from "./lib/docs.ts";
import type { BuildResult } from "./lib/docs-db.ts";
import { compare, formatRatio, parseEstimateSection, summarize } from "./lib/estimate.ts";
import { asString, setFrontmatter, splitFrontmatter } from "./lib/frontmatter.ts";
import {
  DIAGNOSE_AFTER,
  extend,
  finishBlockers,
  formatDuration,
  type Ledger,
  needsRed,
  nextTask,
  outcome,
  PARK_AFTER,
  recordRed,
  recordVerdict,
  scaffold,
  startTask,
} from "./lib/ledger.ts";
import { issueNumber, parsePrd } from "./lib/prd.ts";
import { type BoardStatus, syncBoard } from "./lib/project.ts";
import {
  appendOutcome,
  fileProbe,
  gh,
  listLedgers,
  placeLedger,
  prdDir,
  readConfig,
  readLedger,
  readOutcomes,
  removeLedger,
  repoRoot,
  runCommand,
  updateLedger,
  withLedgerLock,
} from "./lib/repo.ts";
import { issueComment, issueLabel, runnerReport } from "./lib/runner/commands.ts";

function need(value: string | undefined, usage: string): string {
  if (!value) {
    throw new Error(`사용법: ${usage}`);
  }
  return value;
}

function needIssue(value: string | undefined, usage: string): number {
  const issue = issueNumber(need(value, usage));
  if (issue === null) {
    throw new Error(`이슈 번호가 아닙니다: ${value}\n사용법: ${usage}`);
  }
  return issue;
}

/** 보드를 옮기고, 못 했으면 이유만 알린다. 러너는 보드 때문에 멈추지 않는다. */
function board(root: string, issue: number, status: BoardStatus | null): void {
  const warning = syncBoard(root, issue, status);
  if (warning) {
    console.error(`⚠ ${warning}`);
  }
}

/** 초안 이슈의 라벨. 초안도 이슈를 먼저 만들어 번호를 받고, 승인된 push 가 이 라벨을 뗀다. */
const DRAFT_LABEL = "prd:draft";

function prdPush(root: string, args: string[]): void {
  const draft = args.includes("--draft");
  const file = resolve(
    need(
      args.find((arg) => !arg.startsWith("--")),
      "pnpm prd:push docs/prd/<파일>.md [--draft]",
    ),
  );
  const text = readFileSync(file, "utf8");
  const prd = parsePrd(text);
  if (prd.issue !== null) {
    gh(root, ["issue", "edit", String(prd.issue), "--title", prd.title, "--body-file", file]);
    console.log(`이슈 #${prd.issue} 본문을 갱신했습니다 — ${prd.title}`);
    if (!draft) {
      issueLabel(root, [String(prd.issue), "--remove", DRAFT_LABEL]);
    }
    board(root, prd.issue, null);
    return;
  }

  // 새 이슈다. 번호를 받은 뒤 머리말에 적고, 캐시 파일 이름 앞에 번호를 붙인다.
  // 담당자는 늘 이슈를 만드는 계정이다.
  const url = gh(root, ["issue", "create", "--title", prd.title, "--body-file", file, "--assignee", "@me"]).trim();
  const issue = issueNumber(url.split("/").at(-1) ?? "");
  if (issue === null) {
    throw new Error(`만든 이슈의 번호를 읽지 못했습니다: ${url}`);
  }
  const name = `${issue}-${basename(file).replace(/^\d+-/, "")}`;
  const numbered = setFrontmatter(setFrontmatter(text, "issue", String(issue)), "file", name);
  const target = join(dirname(file), name);
  writeFileSync(file, numbered);
  renameSync(file, target);
  gh(root, ["issue", "edit", String(issue), "--body-file", target]);
  if (draft) {
    issueLabel(root, [String(issue), "--add", DRAFT_LABEL]);
  }
  console.log(
    `${draft ? "초안 " : ""}이슈 #${issue} 를 만들었습니다 — ${prd.title}\n${url}\n캐시: ${relative(root, target)}`,
  );
  board(root, issue, "backlog");
}

function prdPull(root: string, args: string[]): void {
  const number = needIssue(args[0], "pnpm prd:pull <이슈>");
  const issue = JSON.parse(gh(root, ["issue", "view", String(number), "--json", "number,title,body"])) as {
    number: number;
    title: string;
    body: string;
  };
  const { data } = splitFrontmatter(issue.body);
  if (asString(data, "type") !== "prd") {
    throw new Error(`이슈 #${number} 의 본문은 PRD 가 아닙니다 (머리말에 type: prd 가 없습니다)`);
  }
  // 이슈 본문이 정한 이름이라도 캐시 디렉터리 밖으로는 쓰지 않는다.
  const name = basename(asString(data, "file") ?? `${number}.md`);
  mkdirSync(prdDir(root), { recursive: true });
  const path = join(prdDir(root), name);
  const body = setFrontmatter(issue.body, "issue", String(number));
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`);
  console.log(`#${number} → ${relative(root, path)}`);
}

function ledgerNew(root: string, args: string[]): void {
  const force = args.includes("--force");
  // --extend: PRD 에 작업을 더했을 때. 이미 있던 작업의 판정은 그대로 두고 새 작업만 붙인다.
  const extending = args.includes("--extend");
  const file = resolve(
    need(
      args.find((arg) => !arg.startsWith("--")),
      "pnpm ledger:new docs/prd/<파일>.md [--force | --extend]",
    ),
  );
  const prd = parsePrd(readFileSync(file, "utf8"));
  const fresh = scaffold(prd, {
    prdFile: relative(root, file),
    now: new Date(),
    probe: fileProbe(root),
    tddAreas: readConfig(root).tddAreas,
  });
  // 있는지 보기, 읽기, 잇기, 쓰기를 한 잠금 안에서 한다. 동시에 돈 'pnpm ledger:verify' 의 판정을 덮지 않는다.
  const ledger = placeLedger(root, fresh, extending ? { merge: (before) => extend(before, fresh) } : { force });
  console.log(`docs/ledger/${ledger.issue}.json — #${ledger.issue} ${ledger.title}, 작업 ${ledger.tasks.length}개`);
  printTasks(ledger);
  const unspecified = ledger.tasks.filter((task) => task.status === "needs_spec");
  if (unspecified.length > 0) {
    console.log(
      `\n검증 명령이 없는 작업 ${unspecified.length}개는 needs_spec 입니다. PRD 표의 '검증' 칸에 명령을 적고 다시 만드세요.`,
    );
  }
}

const MARK: Record<string, string> = { todo: "○", doing: "▶", done: "✓", parked: "✗", needs_spec: "?" };

function printTasks(ledger: Ledger): void {
  for (const task of ledger.tasks) {
    const time = task.status === "done" ? `  ${formatDuration(task.active_ms)}` : "";
    const retries = task.retries > 0 ? `  (실패 ${task.retries})` : "";
    console.log(`  ${MARK[task.status]} ${task.id}  ${task.title}${time}${retries}`);
  }
}

function work(root: string, args: string[]): void {
  const usage = "pnpm work <이슈> <작업>";
  const issue = needIssue(args[0], usage);
  const taskId = need(args[1], usage);
  let first = false;
  const ledger = updateLedger(root, issue, (before) => {
    first = before.tasks.every((t) => t.started_at === null);
    return startTask(before, taskId, new Date());
  });
  // 이 이슈의 첫 작업을 집는 순간 보드를 옮긴다.
  if (first) {
    board(root, ledger.issue, "in_progress");
  }
  const task = ledger.tasks.find((t) => t.id === taskId)!;
  console.log(`▶ ${task.id}  ${task.title}`);
  console.log(`  범위: ${task.scope.join(", ")}`);
  console.log("  검증:");
  for (const command of task.verify) {
    console.log(`    ${command}`);
  }
  if (task.tdd) {
    console.log(`\n테스트를 먼저 쓰는 작업입니다. 테스트만 쓴 뒤: pnpm ledger:red ${ledger.issue} ${task.id}`);
    console.log(`구현한 뒤: pnpm ledger:verify ${ledger.issue} ${task.id}`);
  } else {
    console.log(`\n구현한 뒤: pnpm ledger:verify ${ledger.issue} ${task.id}`);
  }
}

function runAll(root: string, commands: string[]): boolean {
  for (const command of commands) {
    console.log(`\n$ ${command}`);
    if (!runCommand(root, command)) {
      console.log(`\n✗ 실패: ${command}`);
      return false;
    }
  }
  return true;
}

function red(root: string, args: string[]): void {
  const usage = "pnpm ledger:red <이슈> <작업>";
  const taskId = need(args[1], usage);
  const issue = needIssue(args[0], usage);
  const before = withLedgerLock(root, issue, () => readLedger(root, issue));
  const task = before.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`작업 '${taskId}' 가 원장에 없습니다`);
  }
  // 돌리기 전에 기록할 수 있는 상태인지 본다.
  recordRed(before, taskId, { failed: true, now: new Date() });
  // 검증은 잠금 밖에서 돌리고, 기록은 그 사이 바뀌었을 수 있는 최신 원장에 더한다.
  const failed = !runAll(root, task.verify);
  updateLedger(root, issue, (latest) => recordRed(latest, taskId, { failed, now: new Date() }));
  console.log(`\n✓ ${taskId} 의 실패를 기록했습니다. 이제 구현하고: pnpm ledger:verify ${before.issue} ${taskId}`);
}

function verify(root: string, args: string[]): void {
  const usage = "pnpm ledger:verify <이슈> <작업>";
  const taskId = need(args[1], usage);
  const issue = needIssue(args[0], usage);
  // 검증 전의 읽기는 상태 확인에만 쓴다. 판정은 검증 뒤의 최신 원장에 더한다.
  const before = withLedgerLock(root, issue, () => readLedger(root, issue));
  const task = before.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`작업 '${taskId}' 가 원장에 없습니다`);
  }
  if (task.status !== "doing") {
    throw new Error(`작업 '${taskId}' 는 ${task.status} 입니다. 'pnpm work' 로 먼저 집으세요`);
  }
  if (needsRed(task)) {
    throw new Error(
      `작업 '${taskId}' 는 테스트를 먼저 쓰는 작업입니다. 구현하기 전에 'pnpm ledger:red ${before.issue} ${taskId}' 로 실패를 기록하세요`,
    );
  }

  const started = Date.now();
  const passed = runAll(root, task.verify);
  const verifyMs = Date.now() - started;
  const after = updateLedger(root, issue, (latest) =>
    recordVerdict(latest, taskId, { passed, verifyMs, now: new Date() }),
  );

  const result = after.tasks.find((t) => t.id === taskId)!;
  if (passed) {
    console.log(
      `\n✓ ${taskId} done — 작업 ${formatDuration(result.active_ms)}, 검증 ${formatDuration(result.verify_ms)}`,
    );
    const next = nextTask(after);
    console.log(
      next ? `다음: pnpm work ${after.issue} ${next.id}` : `남은 todo 가 없습니다: pnpm finish ${after.issue}`,
    );
    return;
  }
  if (result.status === "parked") {
    console.log(`\n${taskId} 는 ${PARK_AFTER}번 실패해 parked 가 됐습니다. 사람이 판단할 차례입니다.`);
  } else if (result.retries >= DIAGNOSE_AFTER) {
    console.log(
      `\n${result.retries}번째 실패입니다. 다시 돌리기 전에 원인을 먼저 확인하세요 (${PARK_AFTER}번이면 parked).`,
    );
  }
  process.exitCode = 1;
}

function finish(root: string, args: string[]): void {
  const issue = needIssue(args[0], "pnpm finish <이슈>");
  const done = withLedgerLock(root, issue, () => {
    const ledger = readLedger(root, issue);
    const blockers = finishBlockers(ledger);
    if (blockers.length > 0) {
      return { ledger, blockers, record: null };
    }
    const record = outcome(ledger, new Date());
    appendOutcome(root, record);
    removeLedger(root, ledger.issue);
    return { ledger, blockers, record };
  });
  const { ledger, blockers, record } = done;
  if (record === null) {
    console.log("마감할 수 없습니다. 끝나지 않은 작업:");
    for (const line of blockers) {
      console.log(`  ${line}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `✓ #${ledger.issue} 마감 — 작업 합계 ${formatDuration(record.active_ms)}, 전체 ${formatDuration(record.lead_time_ms)}`,
  );
  printTasks(ledger);
  console.log("\n결과를 outcomes.jsonl 에 적고 원장을 지웠습니다. 이 두 변경을 커밋하세요:");
  console.log("  git add -A docs/ledger");
  // 러너 세션은 이슈를 닫지 않는다(ADR-0032). Closes 를 푸시하면 GitHub 이 이슈를 닫아 사람의 검토 자리가 없어진다.
  const closing = process.env.HARNESS_RUNNER ? "Refs" : "Closes";
  console.log(`  git commit -m "chore(ledger): #${ledger.issue} 마감" -m "${closing} #${ledger.issue}"`);
}

function status(root: string, args: string[]): void {
  const only = args.find((arg) => !arg.startsWith("--"));
  const issue = only ? needIssue(only, "pnpm ledger:status [이슈]") : null;
  const ledgers = issue !== null ? [withLedgerLock(root, issue, () => readLedger(root, issue))] : listLedgers(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(ledgers, null, 2));
    return;
  }
  if (ledgers.length === 0) {
    console.log("진행 중인 원장이 없습니다.");
    return;
  }
  for (const ledger of ledgers) {
    const done = ledger.tasks.filter((task) => task.status === "done").length;
    console.log(`#${ledger.issue}  ${ledger.title}  (${done}/${ledger.tasks.length})`);
    printTasks(ledger);
  }
}

function accuracy(root: string): void {
  const records = readOutcomes(root);
  const rows = [];
  const missing: number[] = [];
  for (const record of records) {
    const file = readdirSync(prdDir(root)).find((name) => name.startsWith(`${record.issue}-`));
    const estimate = file ? parseEstimateSection(readFileSync(join(prdDir(root), file), "utf8")) : null;
    if (!estimate) {
      missing.push(record.issue);
      continue;
    }
    rows.push(compare(record, estimate));
  }
  if (rows.length === 0) {
    console.log("추정과 실측을 맞댈 이슈가 없습니다(docs/prd/ 캐시에 `## 추정` 이 있는 끝난 이슈가 없음).");
    return;
  }
  console.log("이슈  낙관 / 현실 / 비관(작업)  |  실측 작업  실측 전체  |  작업÷현실  전체÷현실  판정");
  for (const row of rows) {
    const e = row.estimate;
    console.log(
      `#${String(row.issue).padEnd(4)} ${formatDuration(e.optimistic.work_ms)} / ${formatDuration(e.realistic.work_ms)} / ${formatDuration(e.pessimistic.work_ms)}  |  ${formatDuration(row.actual_work_ms)}  ${formatDuration(row.actual_lead_ms)}  |  ${formatRatio(row.work_ratio)}  ${formatRatio(row.lead_ratio)}  ${row.verdict}`,
    );
  }
  const s = summarize(rows);
  console.log(
    `\n이슈 ${s.count}개. 작업÷현실 중앙값 ${formatRatio(s.work_ratio_median)}, 전체÷현실 중앙값 ${formatRatio(s.lead_ratio_median)}. 낙관~비관 안 ${s.inside}, 낙관보다 짧음 ${s.under}, 비관 초과 ${s.over}.`,
  );
  console.log(
    "다음 PRD 의 현실 값은 비슷한 이슈의 실측 작업 합계에 이 중앙값을 곱하지 말고, 실측 자체를 그대로 기준으로 삼는다.",
  );
  if (missing.length > 0) {
    console.log(`추정이 없거나 캐시가 없는 이슈: ${missing.map((n) => `#${n}`).join(", ")}`);
  }
}

function outcomes(root: string): void {
  const records = readOutcomes(root);
  if (records.length === 0) {
    console.log("끝난 이슈가 아직 없습니다.");
    return;
  }
  for (const record of records) {
    console.log(
      `#${record.issue}  ${record.title}  작업 ${formatDuration(record.active_ms)}, 전체 ${formatDuration(record.lead_time_ms)}`,
    );
    for (const task of record.tasks) {
      const retries = task.retries > 0 ? `  (실패 ${task.retries})` : "";
      console.log(
        `  ${MARK[task.status]} ${task.id}  ${task.title}  ${formatDuration(task.active_ms)}  [${task.scope.join(", ")}]${retries}`,
      );
    }
  }
}

// ── 결정 기록 색인 (docs/adr, docs/devlog → docs/docs.db) ──

// docs-db.ts 는 node:sqlite 를 불러와 ExperimentalWarning 을 찍으므로 docs:* 명령일 때만 가져온다.
type DocsDb = typeof import("./lib/docs-db.ts");
let docsDb: DocsDb | null = null;
function db(): DocsDb {
  if (!docsDb) {
    throw new Error("docs-db 모듈을 불러오지 않았습니다");
  }
  return docsDb;
}

function docsDbPath(root: string): string {
  return join(root, "docs", "docs.db");
}

/** 색인을 다시 만든다. 머리말이 틀린 파일이 있으면 파일마다 이유를 모아 던진다. */
function rebuildDocs(root: string): Extract<BuildResult, { ok: true }> {
  const result = db().buildIndex(root, docsDbPath(root));
  if (!result.ok) {
    const lines = result.problems.map((problem) => `${problem.path}: ${problem.reason}`);
    throw new Error(`색인을 만들지 못했습니다 — 머리말 문제 ${result.problems.length}개:\n${lines.join("\n")}`);
  }
  return result;
}

/** 색인이 없거나 마크다운보다 낡았으면 다시 만든 뒤 연다. */
function withDocsIndex<T>(root: string, query: (index: ReturnType<DocsDb["openIndex"]>) => T): T {
  if (!db().isFresh(root, docsDbPath(root))) {
    const built = rebuildDocs(root);
    console.error(`색인을 다시 만들었습니다 (${built.count}개)`);
  }
  const index = db().openIndex(docsDbPath(root));
  try {
    return query(index);
  } finally {
    index.close();
  }
}

/** 열 너비를 맞춰 한 줄에 하나씩 찍는다. 마지막 열은 채우지 않는다. */
function printTable(rows: string[][]): void {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  for (const row of rows) {
    console.log(
      `  ${row
        .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!)))
        .join("  ")
        .trimEnd()}`,
    );
  }
}

/** `--name 값` 꼴의 옵션을 읽는다. 값이 없으면 오류. */
function option(args: string[], name: string, usage: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) {
    return undefined;
  }
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} 에 값이 없습니다\n사용법: ${usage}`);
  }
  return value;
}

/** 옵션과 그 값을 뺀 위치 인자. */
function positionals(args: string[], valued: readonly string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (valued.includes(arg)) {
      i++;
    } else if (!arg.startsWith("--")) {
      out.push(arg);
    }
  }
  return out;
}

const dash = (value: string | null): string => value ?? "-";

function docsIndex(root: string, args: string[]): void {
  const result = rebuildDocs(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`docs/docs.db — 결정 기록 ${result.count}개를 색인했습니다`);
}

function docsSearch(root: string, args: string[]): void {
  const usage = 'pnpm docs:search "<낱말>" [--json]';
  const query = need(positionals(args).join(" ").trim(), usage);
  const hits = withDocsIndex(root, (index) => db().search(index, query));
  if (args.includes("--json")) {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }
  if (hits.length === 0) {
    console.log(`'${query}' 와 일치하는 결정 기록이 없습니다.`);
    return;
  }
  printTable(hits.map((hit) => [hit.id, hit.kind, hit.title, dash(hit.status), dash(hit.date), hit.snippet]));
}

const LIST_USAGE = "pnpm docs:list [--type adr|devlog] [--status <s>] [--tag <t>] [--json]";

function docsList(root: string, args: string[]): void {
  const type = option(args, "--type", LIST_USAGE);
  if (type !== undefined && type !== "adr" && type !== "devlog") {
    throw new Error(`--type 은 adr 또는 devlog 입니다: ${type}\n사용법: ${LIST_USAGE}`);
  }
  const status = option(args, "--status", LIST_USAGE);
  const tag = option(args, "--tag", LIST_USAGE);
  const items = withDocsIndex(root, (index) =>
    db().list(index, {
      ...(type !== undefined ? { kind: type as DocKind } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(tag !== undefined ? { tag } : {}),
    }),
  );
  if (args.includes("--json")) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (items.length === 0) {
    console.log("조건에 맞는 결정 기록이 없습니다.");
    return;
  }
  printTable(
    items.map((item) => [item.id, item.kind, item.title, dash(item.status), dash(item.date), item.tags.join(", ")]),
  );
}

function docsNeighbors(root: string, args: string[]): void {
  const id = need(positionals(args)[0], "pnpm docs:neighbors <id> [--json]");
  const found = withDocsIndex(root, (index) => db().neighbors(index, id));
  if (found === null) {
    throw new Error(`색인에 없는 id 입니다: ${id}`);
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  if (found.length === 0) {
    console.log(`${id} 와 이어진 글이 없습니다.`);
    return;
  }
  printTable(found.map((n) => [n.id, n.kind, n.title, n.reasons.join(", ")]));
}

const COMMANDS: Record<string, (root: string, args: string[]) => void | Promise<void>> = {
  "prd:push": prdPush,
  "prd:pull": prdPull,
  "ledger:new": ledgerNew,
  work,
  "ledger:red": red,
  "ledger:verify": verify,
  finish,
  "ledger:status": status,
  "ledger:outcomes": outcomes,
  "ledger:accuracy": accuracy,
  "docs:index": docsIndex,
  "docs:search": docsSearch,
  "docs:list": docsList,
  "docs:neighbors": docsNeighbors,
  "chat:eval": chatEval,
  "issue:label": issueLabel,
  "issue:comment": issueComment,
  "runner:report": runnerReport,
};

const [name, ...rest] = process.argv.slice(2);
const command = name ? COMMANDS[name] : undefined;
if (!command) {
  console.error(`명령: ${Object.keys(COMMANDS).join(", ")}`);
  process.exit(2);
}
try {
  if (name!.startsWith("docs:")) {
    docsDb = await import("./lib/docs-db.ts");
  }
  await command(repoRoot(), rest);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
