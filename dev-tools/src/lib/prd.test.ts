import assert from "node:assert/strict";
import { test } from "node:test";

import { setFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { issueNumber, parsePrd, splitRow } from "./prd.ts";

const PRD = `---
type: prd
issue: 12
title: "주문 상태 규칙의 뼈대"
file: 12-order-state-rules.md
depends_on: [3, "#4"]
scope_paths:
  - apps/api
  - docs
---

## Summary

주문 상태가 정해진 순서로만 바뀌게 한다.

## 서브 티켓

| ID | 제목 | 범위 | 의존성 | 검증 |
|---|---|---|---|---|
| S1 | 상태 타입 | \`apps/api/src/orders/state.ts\` | - | |
| S2 | 상태 전환 규칙 | \`apps/api/src/orders/rules.ts\` | S1 | |
| S3 | 규칙 문서 | \`docs/order-rules.md\` | S2 | \`test -f docs/order-rules.md\` |

## 수용 기준

- 상한을 넘는 변화량은 잘린다.
`;

test("머리말은 값, 인라인 목록, 블록 목록을 읽는다", () => {
  const { data, body } = splitFrontmatter(PRD);
  assert.equal(data.issue, "12");
  assert.equal(data.title, "주문 상태 규칙의 뼈대");
  assert.deepEqual(data.depends_on, ["3", "#4"]);
  assert.deepEqual(data.scope_paths, ["apps/api", "docs"]);
  assert.ok(body.includes("## 서브 티켓"));
});

test("머리말이 없으면 본문만 돌려주고, 닫히지 않으면 거부한다", () => {
  assert.deepEqual(splitFrontmatter("본문"), { data: {}, body: "본문" });
  assert.throws(() => splitFrontmatter("---\nissue: 12\n"), /닫는/);
});

test("서브 티켓 표에서 작업을 읽는다", () => {
  const prd = parsePrd(PRD);
  assert.equal(prd.issue, 12);
  assert.deepEqual(prd.dependsOn, [3, 4]);
  assert.equal(prd.file, "12-order-state-rules.md");
  assert.deepEqual(
    prd.tasks.map((t) => t.id),
    ["S1", "S2", "S3"],
  );
  assert.deepEqual(prd.tasks[0]!.scope, ["apps/api/src/orders/state.ts"]);
  assert.deepEqual(prd.tasks[0]!.dependsOn, []);
  assert.deepEqual(prd.tasks[1]!.dependsOn, ["S1"]);
  assert.deepEqual(prd.tasks[2]!.verify, ["test -f docs/order-rules.md"]);
});

test("열 순서가 달라도 머리글 이름으로 찾는다", () => {
  const swapped = PRD.replace(
    /\| ID \| 제목 \| 범위 \| 의존성 \| 검증 \|[\s\S]*?\n\n/,
    ["| 범위 | ID | 제목 |", "|---|---|---|", "| `apps/api` | S1 | 상태 타입 |", "", ""].join("\n"),
  );
  const prd = parsePrd(swapped);
  assert.equal(prd.tasks.length, 1);
  assert.equal(prd.tasks[0]!.title, "상태 타입");
  assert.deepEqual(prd.tasks[0]!.verify, []);
});

test("백틱 안의 세로줄은 칸을 나누지 않는다", () => {
  assert.deepEqual(splitRow("| a | `x | y` | c |"), ["a", "`x | y`", "c"]);
});

test("백슬래시로 가린 세로줄은 칸을 나누지 않고 세로줄 글자가 된다", () => {
  assert.deepEqual(splitRow("| a | `x \\| y` | c |"), ["a", "`x | y`", "c"]);
});

test("잘못된 PRD 는 어디가 틀렸는지 말하며 거부한다", () => {
  assert.throws(() => parsePrd(PRD.replace(/title: .*\n/, "")), /title 이 없습니다/);
  assert.throws(() => parsePrd(PRD.replace("issue: 12", "issue: T-261012a")), /이슈 번호여야/);
  assert.throws(() => parsePrd(PRD.replace('depends_on: [3, "#4"]', "depends_on: [abc]")), /이슈 번호로/);
  assert.throws(() => parsePrd(PRD.replace("## 서브 티켓", "## 작업")), /서브 티켓/);
  assert.throws(() => parsePrd(PRD.replace("  - docs\n", "")), /scope_paths 에 없습니다/);
  assert.throws(() => parsePrd(PRD.replace("| S1 | |", "| S9 | |")), /의존성/);
  assert.throws(() => parsePrd(PRD.replace("| S2 | 상태 전환", "| 2번 | 턴당")), /짧은 이름/);
  assert.throws(() => parsePrd(PRD.replace("| S2 | 상태 전환", "| S1 | 턴당")), /두 번/);
  assert.throws(() => parsePrd(PRD.replace("| ID | 제목 | 범위 |", "| ID | 이름 | 범위 |")), /'제목' 열/);
});

test("아직 올리지 않은 초안은 이슈 번호가 없다", () => {
  assert.equal(parsePrd(PRD.replace("issue: 12\n", "")).issue, null);
});

test("이슈 번호는 # 이 붙어도 읽는다", () => {
  assert.equal(issueNumber("12"), 12);
  assert.equal(issueNumber("#12"), 12);
  assert.equal(issueNumber("T-261012a"), null);
  assert.equal(issueNumber(""), null);
});

test("머리말의 값 하나를 바꾸거나 더한다", () => {
  const draft = PRD.replace("issue: 12\n", "");
  const numbered = setFrontmatter(draft, "issue", "40");
  assert.equal(parsePrd(numbered).issue, 40);
  assert.equal(parsePrd(setFrontmatter(numbered, "issue", "41")).issue, 41);
  // 본문과 다른 줄은 그대로다.
  assert.equal(numbered.replace("issue: 40\n", ""), draft);
  assert.throws(() => setFrontmatter("본문", "issue", "1"), /머리말이 없습니다/);
});
