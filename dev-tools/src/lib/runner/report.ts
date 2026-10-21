// 러너의 결과 댓글을 만든다. 원장 실측, `pnpm test` 로그 꼬리, QA 보고서를 받아 이슈 댓글 마크다운 하나로 엮는다.
//
// 모두 순수 함수다. 파일을 읽는 일은 CLI(`pnpm runner:report`)가 하고 여기에는 글과 객체만 들어온다.
// QA 보고서는 사람이 읽는 HTML 이라 모양이 보고서마다 조금씩 다르다. 그래서 느슨하게 읽는다:
// `<h3>` 하나가 항목 하나이고, 그 안의 "결과" 뒤 첫 판정 낱말과 `<img src>` 만 본다.

import { formatDuration, type Outcome, type TaskStatus } from "../ledger.ts";

/** 표 한 줄에 필요한 작업의 칸. 끝난 이슈의 실측(`Outcome`)과 진행 중인 원장의 작업이 둘 다 이 모양을 가진다. */
export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  retries: number;
  active_ms: number | null;
  verify_ms: number | null;
}

/** `outcomes.jsonl` 의 글에서 그 이슈의 마지막 줄. 없으면 `null`. 깨진 줄은 건너뛴다. */
export function findOutcome(jsonl: string, issue: number): Outcome | null {
  let found: Outcome | null = null;
  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    let record: Outcome;
    try {
      record = JSON.parse(line) as Outcome;
    } catch {
      continue;
    }
    if (record.issue === issue) {
      found = record;
    }
  }
  return found;
}

/** 마크다운 표 칸에 넣을 수 있게 줄바꿈과 `|` 를 지운다. */
function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

const STATUS_WORD: Record<TaskStatus, string> = {
  todo: "○ todo",
  doing: "▶ doing",
  done: "✓ done",
  parked: "✗ parked",
  needs_spec: "? needs_spec",
};

/** 작업별 판정과 시간의 표. 작업이 없으면 그렇다고 한 줄. */
export function taskTable(tasks: readonly TaskRow[]): string {
  if (tasks.length === 0) {
    return "_작업이 없습니다._";
  }
  const lines = ["| 작업 | 제목 | 판정 | 작업 시간 | 검증 시간 | 실패 |", "|---|---|---|---|---|---|"];
  for (const task of tasks) {
    lines.push(
      `| ${cell(task.id)} | ${cell(task.title)} | ${STATUS_WORD[task.status]} | ${formatDuration(task.active_ms)} | ${formatDuration(task.verify_ms)} | ${task.retries} |`,
    );
  }
  return lines.join("\n");
}

export interface TestSummary {
  /** 통과 `true`, 실패 `false`, 로그만으로 알 수 없으면 `null`. */
  passed: boolean | null;
  /** node:test 의 `# pass`·`# fail` 과 cargo 의 `test result:` 를 더한 수. 하나도 못 찾으면 `null`. */
  pass: number | null;
  fail: number | null;
  /** 로그의 마지막 줄들(빈 줄 끝은 뺀다). */
  tail: string[];
}

// node:test 는 TAP 이면 `# pass 3`, spec 이면 `ℹ pass 3` 으로 적는다. pnpm -r 은 줄 앞에 패키지 이름을 붙인다.
const COUNT = /(?:^|\s)(?:#|ℹ) (pass|fail) (\d+)\s*$/gm;
const FAILURE = [
  /ELIFECYCLE/,
  /Command failed with exit code/,
  /test result: FAILED/,
  /(?:^|\s)(?:#|ℹ) fail [1-9]/m,
  /^✗ /m,
];
const SUCCESS = [/(?:^|\s)(?:#|ℹ) pass \d+/m, /test result: ok\./];

// 색을 바꾸는 터미널 제어 문자열. 댓글에 그대로 실리면 읽을 수 없다.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

/**
 * `pnpm test` 로그를 요약한다. 종료 코드를 알면 그것이 판정이고, 모르면 로그의 낱말로 가늠한다
 * (실패 낱말이 하나라도 있으면 실패, 통과 낱말만 있으면 통과, 둘 다 없으면 모름).
 */
export function summarizeTestLog(
  log: string,
  options: { tailLines?: number; exitCode?: number | null } = {},
): TestSummary {
  const clean = log.replace(ANSI, "");
  const lines = clean.split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)!.trim() === "") {
    lines.pop();
  }
  const tail = lines.slice(-(options.tailLines ?? 30));

  let pass: number | null = null;
  let fail: number | null = null;
  const add = (current: number | null, value: string | undefined): number | null =>
    value === undefined ? current : (current ?? 0) + Number(value);
  for (const match of clean.matchAll(COUNT)) {
    if (match[1] === "pass") {
      pass = add(pass, match[2]);
    } else {
      fail = add(fail, match[2]);
    }
  }
  for (const match of clean.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) {
    pass = add(pass, match[1]);
    fail = add(fail, match[2]);
  }

  let passed: boolean | null;
  if (options.exitCode !== undefined && options.exitCode !== null) {
    passed = options.exitCode === 0;
  } else if (FAILURE.some((pattern) => pattern.test(clean))) {
    passed = false;
  } else if (SUCCESS.some((pattern) => pattern.test(clean))) {
    passed = true;
  } else {
    passed = null;
  }
  return { passed, pass, fail, tail };
}

export type QaVerdict = "통과" | "실패" | "확인 불가";

export interface QaItem {
  title: string;
  verdict: QaVerdict | null;
  /** 보고서에 적힌 그대로의 `src`(보고서 디렉터리 기준 상대 경로가 보통이다). */
  images: string[];
}

export interface QaReport {
  title: string | null;
  items: QaItem[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** 태그를 지우고 흔한 엔티티를 풀고 공백을 하나로 모은다. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/\s+/g, " ")
    .trim();
}

/** 판정 낱말. "확인 불가" 를 먼저 본다(글 안의 다른 낱말보다 앞서야 한다). */
function verdictIn(plain: string): QaVerdict | null {
  const match = /(확인 불가|실패|통과)/.exec(plain);
  return match ? (match[1] as QaVerdict) : null;
}

/**
 * QA 보고서 HTML 에서 항목을 뽑는다. `<h3>` 하나가 항목 하나이고, 그 항목은 다음 `<h3>`·`<h2>`·`</section>`
 * 앞까지다. 판정이 없는 `<h3>`(예: "준비")는 항목으로 치지 않는다. 판정은 "결과" 뒤의 첫 낱말이다.
 */
export function parseQaReport(html: string): QaReport {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const items: QaItem[] = [];
  const heads = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  for (const [i, head] of heads.entries()) {
    const start = head.index + head[0].length;
    const nextHead = heads[i + 1]?.index ?? html.length;
    const rest = html.slice(start, nextHead);
    const stop = rest.search(/<h2[\s>]|<\/section>/i);
    const body = stop === -1 ? rest : rest.slice(0, stop);
    const plain = text(body);
    const at = plain.lastIndexOf("결과");
    const verdict = at === -1 ? null : verdictIn(plain.slice(at + "결과".length));
    if (verdict === null) {
      continue;
    }
    const images = [...body.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!);
    items.push({ title: text(head[1]!), verdict, images });
  }
  return { title: h1 ? text(h1[1]!) : null, items };
}

/** QA 항목 표. `imageBase` 를 주면 이미지 경로 앞에 붙인다(러너 로컬 경로를 적을 때). */
export function qaTable(report: QaReport, options: { imageBase?: string } = {}): string {
  if (report.items.length === 0) {
    return "_보고서에서 판정이 적힌 항목을 찾지 못했습니다._";
  }
  const base = options.imageBase ? `${options.imageBase.replace(/\/+$/, "")}/` : "";
  const counts = { 통과: 0, 실패: 0, "확인 불가": 0 };
  const lines = ["| # | 항목 | 결과 | 스크린샷 |", "|---|---|---|---|"];
  for (const [i, item] of report.items.entries()) {
    if (item.verdict !== null) {
      counts[item.verdict]++;
    }
    const shots = item.images.map((src) => `\`${cell(`${base}${src}`)}\``).join("<br>") || "-";
    lines.push(`| ${i + 1} | ${cell(item.title)} | ${item.verdict ?? "-"} | ${shots} |`);
  }
  return [`통과 ${counts.통과} / 실패 ${counts.실패} / 확인 불가 ${counts["확인 불가"]}`, "", ...lines].join("\n");
}

export interface CommentInput {
  issue: number;
  sha: string;
  /** 작업 표의 출처. 끝난 이슈면 실측, 아니면 원장. 둘 다 없으면 `null`. */
  tasks: { source: "outcome" | "ledger"; rows: readonly TaskRow[] } | null;
  test: TestSummary | null;
  qa: { report: QaReport; imageBase?: string } | null;
}

/** 댓글의 첫 줄에 두는 표식. 러너가 자기 댓글을 다시 찾을 때 쓴다. */
export const COMMENT_MARKER = "<!-- beside-pet-runner:report -->";

function testSection(test: TestSummary | null): string {
  if (test === null) {
    return "_테스트 로그를 받지 않았습니다._";
  }
  const word = test.passed === null ? "판정 모름" : test.passed ? "✓ 통과" : "✗ 실패";
  const counts = test.pass === null && test.fail === null ? "" : ` — 통과 ${test.pass ?? 0}, 실패 ${test.fail ?? 0}`;
  // 로그 안의 ``` 가 코드 블록을 닫지 않게 울타리를 더 길게 잡는다.
  const fence = "`".repeat(Math.max(3, ...[...test.tail.join("\n").matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [
    `**${word}**${counts}`,
    "",
    "<details><summary>로그 꼬리</summary>",
    "",
    fence,
    ...test.tail,
    fence,
    "",
    "</details>",
  ].join("\n");
}

/**
 * 공개 이슈에 싣는 이미지 경로의 앞부분. 러너는 QA 보고서의 절대 경로를 넘기지만, 그 경로에는 이 Mac 의
 * 사용자 이름이 들어 있으므로 레포 기준 상대 경로(`outputs/qa/<이슈>`)만 남긴다.
 */
function publicImageBase(issue: number, imageBase: string | undefined): string | undefined {
  if (imageBase === undefined || imageBase === "") {
    return undefined;
  }
  const fromOutputs = /(?:^|\/)(outputs\/.*)$/.exec(imageBase);
  if (fromOutputs) {
    return fromOutputs[1];
  }
  return imageBase.startsWith("/") || /^[A-Za-z]:[\\/]/.test(imageBase) ? `outputs/qa/${issue}` : imageBase;
}

/** 이슈 댓글 마크다운 하나. */
export function buildComment(input: CommentInput): string {
  const imageBase = input.qa === null ? undefined : publicImageBase(input.issue, input.qa.imageBase);
  const tasks =
    input.tasks === null
      ? "_원장 실측이 없습니다._"
      : `${input.tasks.source === "outcome" ? "마감한 실측" : "진행 중인 원장"}\n\n${taskTable(input.tasks.rows)}`;
  const qa = input.qa === null ? "_QA 보고서가 없습니다._" : qaTable(input.qa.report, imageBase ? { imageBase } : {});
  return [
    COMMENT_MARKER,
    `## 러너 결과 #${input.issue}`,
    "",
    `커밋 \`${input.sha}\``,
    "",
    "### 작업",
    "",
    tasks,
    "",
    "### pnpm test",
    "",
    testSection(input.test),
    "",
    "### QA",
    "",
    qa,
    "",
  ].join("\n");
}
