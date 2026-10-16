// PRD 읽기. 머리말과 `## 서브 티켓` 표에서 원장을 만들 재료를 뽑는다.
//
// 표는 머리글 이름으로 열을 찾으므로 열 순서는 자유다.
//   ID, 제목, 범위는 필수이고 의존성, 검증, TDD 는 선택이다.
//
// 티켓 번호는 따로 두지 않는다. PRD 의 이름은 GitHub 이슈 번호이고, 작업 ID 는 그 PRD
// 안에서만 통하는 짧은 이름(S1, S2)이다.

import { asList, asString, splitFrontmatter } from "./frontmatter.ts";

export interface PrdTask {
  id: string;
  title: string;
  scope: string[];
  dependsOn: string[];
  /** 표의 `검증` 칸에 직접 적은 명령. 비어 있으면 범위에서 끌어낸다. */
  verify: string[];
  /** 표의 `TDD` 칸. `예` / `아니오`, 비어 있으면 `null` 이고 범위에서 정한다. */
  tdd: boolean | null;
}

export interface Prd {
  /** 이 PRD 의 GitHub 이슈 번호. 아직 올리지 않은 초안이면 `null`. */
  issue: number | null;
  title: string;
  /** 캐시 파일 이름 (`docs/prd/` 아래). */
  file: string | undefined;
  /** 먼저 닫혀야 하는 이슈 번호. */
  dependsOn: number[];
  scopePaths: string[];
  tasks: PrdTask[];
}

/** `12` 나 `#12` 를 이슈 번호로 읽는다. 번호가 아니면 `null`. */
export function issueNumber(value: string): number | null {
  const match = /^#?(\d+)$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

const TASK_HEADING = /^##\s+서브\s*티켓\s*$/;

/** 백틱 안의 `|` 는 건드리지 않고 표의 한 줄을 칸으로 나눈다. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  let escaped = false;
  for (const ch of line.trim()) {
    // GitHub 표는 코드 스팬 안에서도 `\|` 로 적어야 하므로, 백슬래시 뒤의 세로줄은 글자로 둔다.
    if (escaped) {
      current += ch === "|" ? ch : `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "`") {
      inCode = !inCode;
    }
    if (ch === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  // 줄 양 끝의 `|` 가 만든 빈 칸을 뗀다.
  if (cells[0] === "") {
    cells.shift();
  }
  if (cells.at(-1) === "") {
    cells.pop();
  }
  return cells;
}

function codeSpans(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim());
}

/** 백틱으로 감싼 값이 있으면 그것만, 없으면 쉼표로 나눈 값. `-` 는 없음이다. */
function tokens(cell: string): string[] {
  const spans = codeSpans(cell);
  if (spans.length > 0) {
    return spans;
  }
  return cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "-");
}

function yesNo(cell: string, id: string): boolean | null {
  const value = cell.replace(/`/g, "").trim();
  if (value === "" || value === "-") {
    return null;
  }
  if (value === "예") {
    return true;
  }
  if (value === "아니오") {
    return false;
  }
  throw new Error(`작업 '${id}' 의 TDD 칸은 '예' 나 '아니오' 로 적습니다: ${value}`);
}

function covered(path: string, scopePaths: string[]): boolean {
  const clean = (p: string) => p.replace(/\/+$/, "");
  const target = clean(path);
  return scopePaths.some((scope) => {
    const base = clean(scope);
    return target === base || target.startsWith(`${base}/`);
  });
}

function parseTaskTable(body: string, scopePaths: string[]): PrdTask[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => TASK_HEADING.test(line.trim()));
  if (start === -1) {
    throw new Error("'## 서브 티켓' 절이 없습니다");
  }
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) {
      break;
    }
    if (line.trim().startsWith("|")) {
      rows.push(line);
    } else if (rows.length > 0 && line.trim() !== "") {
      break;
    }
  }
  if (rows.length < 3) {
    throw new Error("'## 서브 티켓' 절에 표가 없거나 행이 없습니다");
  }

  const header = splitRow(rows[0]!);
  const column = (name: string): number => header.indexOf(name);
  for (const required of ["ID", "제목", "범위"]) {
    if (column(required) === -1) {
      throw new Error(`서브 티켓 표에 '${required}' 열이 없습니다`);
    }
  }

  const tasks: PrdTask[] = [];
  for (const row of rows.slice(2)) {
    const cells = splitRow(row);
    const cell = (name: string): string => (column(name) === -1 ? "" : (cells[column(name)] ?? ""));
    const id = cell("ID").replace(/`/g, "").trim();
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(id)) {
      throw new Error(`작업 ID '${id}' 는 영문으로 시작하는 짧은 이름이어야 합니다 (예: S1)`);
    }
    if (tasks.some((task) => task.id === id)) {
      throw new Error(`작업 ID '${id}' 가 두 번 나옵니다`);
    }
    const scope = tokens(cell("범위"));
    if (scope.length === 0) {
      throw new Error(`작업 '${id}' 의 범위가 비어 있습니다`);
    }
    for (const path of scope) {
      if (!covered(path, scopePaths)) {
        throw new Error(`작업 '${id}' 의 범위 '${path}' 가 머리말 scope_paths 에 없습니다`);
      }
    }
    tasks.push({
      id,
      title: cell("제목"),
      scope,
      dependsOn: tokens(cell("의존성")),
      verify: codeSpans(cell("검증")),
      tdd: yesNo(cell("TDD"), id),
    });
  }

  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`작업 '${task.id}' 의 의존성 '${dep}' 가 표에 없습니다`);
      }
    }
  }
  return tasks;
}

export function parsePrd(text: string): Prd {
  const { data, body } = splitFrontmatter(text);
  const title = asString(data, "title");
  if (!title) {
    throw new Error("머리말에 title 이 없습니다");
  }
  const issueText = asString(data, "issue");
  const issue = issueText === undefined ? null : issueNumber(issueText);
  if (issueText !== undefined && issue === null) {
    throw new Error(`머리말의 issue 는 이슈 번호여야 합니다: ${issueText}`);
  }
  const dependsOn = asList(data, "depends_on").map((value) => {
    const number = issueNumber(value);
    if (number === null) {
      throw new Error(`depends_on 은 이슈 번호로 적습니다: ${value}`);
    }
    return number;
  });
  const scopePaths = asList(data, "scope_paths");
  if (scopePaths.length === 0) {
    throw new Error("머리말에 scope_paths 가 없습니다");
  }
  return {
    issue,
    title,
    file: asString(data, "file"),
    dependsOn,
    scopePaths,
    tasks: parseTaskTable(body, scopePaths),
  };
}
