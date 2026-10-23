// PRD 명령: 초안 만들기(prd:new), 이슈로 올리기(prd:push), 캐시로 받기(prd:pull).
// cli.ts 가 COMMANDS 에서 부른다. need, needIssue, board 는 cli.ts 의 다른 명령도 쓴다.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { asString, setFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { issueNumber, newPrdDraft, parsePrd, stampPush } from "./prd.ts";
import { type BoardStatus, syncBoard } from "./project.ts";
import { gh, prdDir } from "./repo.ts";
import { issueLabel } from "./runner/commands.ts";

export function need(value: string | undefined, usage: string): string {
  if (!value) {
    throw new Error(`사용법: ${usage}`);
  }
  return value;
}

export function needIssue(value: string | undefined, usage: string): number {
  const issue = issueNumber(need(value, usage));
  if (issue === null) {
    throw new Error(`이슈 번호가 아닙니다: ${value}\n사용법: ${usage}`);
  }
  return issue;
}

/** 보드를 옮기고, 못 했으면 이유만 알린다. 러너는 보드 때문에 멈추지 않는다. */
export function board(root: string, issue: number, status: BoardStatus | null): void {
  const warning = syncBoard(root, issue, status);
  if (warning) {
    console.error(`⚠ ${warning}`);
  }
}

/** 초안 이슈의 라벨. 초안도 이슈를 먼저 만들어 번호를 받고, 승인된 push 가 이 라벨을 뗀다. */
const DRAFT_LABEL = "prd:draft";

export function prdPush(root: string, args: string[]): void {
  const draft = args.includes("--draft");
  const file = resolve(
    need(
      args.find((arg) => !arg.startsWith("--")),
      "pnpm prd:push docs/prd/<파일>.md [--draft]",
    ),
  );
  const original = readFileSync(file, "utf8");
  const prd = parsePrd(original);
  // 올린 시각을 머리말에 적는다(초안이면 submitted_at, 승인이면 approved_at, 이미 있으면 그대로).
  const text = stampPush(original, { draft, isNew: prd.issue === null }, new Date());
  if (prd.issue !== null) {
    writeFileSync(file, text);
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
  const numbered = setFrontmatter(setFrontmatter(text, "file", name), "issue", String(issue));
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

const PRD_TEMPLATE = join(".claude", "skills", "prd", "references", "template.md");

export function prdNew(root: string, args: string[]): void {
  const usage = "pnpm prd:new <kebab-설명> [--fix]";
  const name = need(
    args.find((arg) => !arg.startsWith("--")),
    usage,
  );
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`이름은 kebab-case 로 적습니다 (예: order-state-rules): ${name}\n${usage}`);
  }
  const target = join(prdDir(root), `${name}.md`);
  if (existsSync(target)) {
    throw new Error(`이미 있습니다: ${relative(root, target)}`);
  }
  const draft = newPrdDraft(
    readFileSync(join(root, PRD_TEMPLATE), "utf8"),
    args.includes("--fix") ? "fix" : "feature",
    new Date(),
  );
  mkdirSync(prdDir(root), { recursive: true });
  writeFileSync(target, draft, { flag: "wx" });
  console.log(`초안을 만들었습니다: ${relative(root, target)}`);
}

export function prdPull(root: string, args: string[]): void {
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
