// 러너(`dev-tools/scripts/runner/implement.sh`)가 부르는 이슈 명령. `cli.ts` 의 COMMANDS 에 붙는다.
//
//   pnpm issue:label <이슈> [--add <라벨,...>] [--remove <라벨,...>]
//   pnpm issue:comment <이슈> --file <마크다운 경로>
//   pnpm runner:report <이슈> --sha <sha> [--test-log <경로>] [--test-exit <코드>] [--qa <report.html>]
//
// 파일과 gh 를 만지는 일은 여기에만 둔다. 무엇을 쓸지는 labels.ts 와 report.ts 의 순수 함수가 정한다.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { issueNumber } from "../prd.ts";
import { gh, ledgerPath, outcomesPath, readLedger, withLedgerLock } from "../repo.ts";
import { planLabels, splitLabels } from "./labels.ts";
import { buildComment, type CommentInput, findOutcome, parseQaReport, summarizeTestLog } from "./report.ts";

interface Parsed {
  issue: number;
  flags: Map<string, string>;
}

/** 첫 위치 인자를 이슈 번호로, `--이름 값` 을 `flags` 로. 모르는 옵션이나 값 없는 옵션은 오류. */
function parse(args: string[], allowed: readonly string[], usage: string): Parsed {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const value = args[i + 1];
    if (!allowed.includes(arg) || value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} 를 읽지 못했습니다\n사용법: ${usage}`);
    }
    flags.set(arg, value);
    i++;
  }
  const issue = rest.length === 1 ? issueNumber(rest[0]!) : null;
  if (issue === null) {
    throw new Error(`사용법: ${usage}`);
  }
  return { issue, flags };
}

/** pnpm 은 스크립트를 레포 루트에서 돌린다. 사람이 준 상대 경로는 부른 자리 기준으로 푼다. */
function userPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function readExisting(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`파일이 없습니다: ${path}`);
  }
  return readFileSync(path, "utf8");
}

const LABEL_USAGE = "pnpm issue:label <이슈> [--add <라벨,...>] [--remove <라벨,...>]";

export function issueLabel(root: string, args: string[]): void {
  const { issue, flags } = parse(args, ["--add", "--remove"], LABEL_USAGE);
  const add = splitLabels(flags.get("--add"));
  const remove = splitLabels(flags.get("--remove"));
  if (add.length === 0 && remove.length === 0) {
    throw new Error(`--add 나 --remove 중 하나는 있어야 합니다\n사용법: ${LABEL_USAGE}`);
  }
  const existing = (
    JSON.parse(gh(root, ["label", "list", "--json", "name", "--limit", "1000"])) as { name: string }[]
  ).map((label) => label.name);
  const plan = planLabels(existing, add, remove);
  for (const label of plan.create) {
    gh(root, ["label", "create", label.name, "--color", label.color, "--description", label.description]);
    console.log(`라벨을 만들었습니다: ${label.name}`);
  }
  const edit = [
    ...(plan.add.length > 0 ? ["--add-label", plan.add.join(",")] : []),
    ...(plan.remove.length > 0 ? ["--remove-label", plan.remove.join(",")] : []),
  ];
  if (edit.length === 0) {
    console.log(`#${issue}: 바꿀 라벨이 없습니다 (뗄 라벨이 레포에 없음)`);
    return;
  }
  gh(root, ["issue", "edit", String(issue), ...edit]);
  console.log(`#${issue}: +[${plan.add.join(", ")}] -[${plan.remove.join(", ")}]`);
}

const COMMENT_USAGE = "pnpm issue:comment <이슈> --file <마크다운 경로>";

export function issueComment(root: string, args: string[]): void {
  const { issue, flags } = parse(args, ["--file"], COMMENT_USAGE);
  const given = flags.get("--file");
  if (given === undefined) {
    throw new Error(`사용법: ${COMMENT_USAGE}`);
  }
  const file = userPath(given);
  readExisting(file);
  console.log(gh(root, ["issue", "comment", String(issue), "--body-file", file]).trim());
}

const REPORT_USAGE =
  "pnpm runner:report <이슈> --sha <sha> [--test-log <경로>] [--test-exit <코드>] [--qa <outputs/qa/<이슈>/report.html>]";

/** 마감한 이슈면 실측 줄, 아직이면 진행 중인 원장의 작업. 둘 다 없으면 `null`. */
function taskSource(root: string, issue: number): CommentInput["tasks"] {
  const done = existsSync(outcomesPath(root)) ? findOutcome(readFileSync(outcomesPath(root), "utf8"), issue) : null;
  if (done !== null) {
    return { source: "outcome", rows: done.tasks };
  }
  if (existsSync(ledgerPath(root, issue))) {
    return { source: "ledger", rows: withLedgerLock(root, issue, () => readLedger(root, issue)).tasks };
  }
  return null;
}

/** 결과 댓글 마크다운을 stdout 에만 쓴다. */
export function runnerReport(root: string, args: string[]): void {
  const { issue, flags } = parse(args, ["--sha", "--test-log", "--test-exit", "--qa"], REPORT_USAGE);
  const sha = flags.get("--sha");
  if (sha === undefined) {
    throw new Error(`--sha 가 없습니다\n사용법: ${REPORT_USAGE}`);
  }
  const testLog = flags.get("--test-log");
  const testExit = flags.get("--test-exit");
  if (testExit !== undefined && !/^\d+$/.test(testExit)) {
    throw new Error(`--test-exit 는 종료 코드(숫자)입니다: ${testExit}`);
  }
  const qaPath = flags.get("--qa");
  const qaFile = qaPath === undefined ? null : userPath(qaPath);
  const comment = buildComment({
    issue,
    sha,
    tasks: taskSource(root, issue),
    test:
      testLog === undefined
        ? null
        : summarizeTestLog(
            readExisting(userPath(testLog)),
            testExit === undefined ? {} : { exitCode: Number(testExit) },
          ),
    // 스크린샷은 아직 올리지 않는다(S3 이 길을 확인한다). 러너 로컬의 보고서 디렉터리 경로를 앞에 붙여 적는다.
    qa: qaFile === null ? null : { report: parseQaReport(readExisting(qaFile)), imageBase: dirname(qaFile) },
  });
  process.stdout.write(comment);
}
