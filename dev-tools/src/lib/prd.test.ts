import assert from "node:assert/strict";
import { test } from "node:test";

import { setFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { issueNumber, newPrdDraft, parsePrd, prdTemplate, splitRow, stampPush } from "./prd.ts";

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
  // 새 키는 머리말의 첫 줄에 들어가고, 본문과 다른 줄은 그대로다.
  assert.equal(numbered.split("\n")[1], "issue: 40");
  assert.equal(numbered.replace("issue: 40\n", ""), draft);
  assert.throws(() => setFrontmatter("본문", "issue", "1"), /머리말이 없습니다/);
});

const NOW = new Date("2026-03-04T05:06:07.890Z");

test("머리말의 세 시각을 읽고, 없으면 null 이다", () => {
  assert.deepEqual(parsePrd(PRD).times, { drafted_at: null, submitted_at: null, approved_at: null });
  const stamped = PRD.replace(
    "type: prd\n",
    "type: prd\ndrafted_at: 2026-03-01T01:00:00Z\nsubmitted_at: 2026-03-01T02:00:00Z\napproved_at: 2026-03-02T03:00:00Z\n",
  );
  assert.deepEqual(parsePrd(stamped).times, {
    drafted_at: "2026-03-01T01:00:00Z",
    submitted_at: "2026-03-01T02:00:00Z",
    approved_at: "2026-03-02T03:00:00Z",
  });
  assert.throws(() => parsePrd(PRD.replace("type: prd\n", "type: prd\ndrafted_at: 어제\n")), /drafted_at/);
});

const TEMPLATE = [
  "# PRD 틀",
  "",
  "설명 문단.",
  "",
  "## 기능",
  "",
  "```markdown",
  "---",
  "type: prd",
  "title: 한 줄 제목",
  "depends_on: []",
  "scope_paths:",
  "  - apps/api",
  "---",
  "",
  "## 요약",
  "",
  "## 서브 티켓",
  "```",
  "",
  "## 수정",
  "",
  "```markdown",
  "---",
  "type: prd",
  "title: 한 줄 제목",
  "depends_on: []",
  "scope_paths:",
  "  - apps/api",
  "---",
  "",
  "## 증상",
  "```",
  "",
].join("\n");

test("틀 파일에서 기능 틀과 수정 틀을 자른다", () => {
  const feature = prdTemplate(TEMPLATE, "feature");
  assert.ok(feature.startsWith("---\ntype: prd\n"));
  assert.ok(feature.includes("## 요약"));
  assert.ok(!feature.includes("## 증상"));
  assert.ok(!feature.includes("```"));
  const fix = prdTemplate(TEMPLATE, "fix");
  assert.ok(fix.includes("## 증상"));
  assert.ok(!fix.includes("## 요약"));
  assert.throws(() => prdTemplate("# 틀\n", "feature"), /기능/);
});

test("새 초안은 title 이 비고 drafted_at 이 지금이다", () => {
  const draft = newPrdDraft(TEMPLATE, "feature", NOW);
  const { data } = splitFrontmatter(draft);
  assert.equal(data.drafted_at, "2026-03-04T05:06:07Z");
  assert.ok(/^title:\s*$/m.test(draft));
  assert.ok(!draft.includes("한 줄 제목"));
  assert.ok(draft.endsWith("\n"));
});

test("초안으로 새 이슈를 만들면 submitted_at, 승인으로 올리면 approved_at 을 적는다", () => {
  const draft = PRD.replace("issue: 12\n", "").replace("file: 12-order-state-rules.md\n", "");
  const submitted = stampPush(draft, { draft: true, isNew: true }, NOW);
  assert.equal(parsePrd(submitted).times.submitted_at, "2026-03-04T05:06:07Z");
  assert.equal(parsePrd(submitted).times.approved_at, null);

  // 이미 번호가 있는 초안을 다시 --draft 로 올리면 아무것도 적지 않는다.
  assert.equal(stampPush(PRD, { draft: true, isNew: false }, NOW), PRD);

  const approved = stampPush(PRD, { draft: false, isNew: false }, NOW);
  assert.equal(parsePrd(approved).times.approved_at, "2026-03-04T05:06:07Z");
  // 머리말 첫 줄 규칙: 이미 있던 줄의 순서는 그대로다.
  assert.deepEqual(approved.split("\n").slice(0, 3), PRD.split("\n").slice(0, 3));

  // 이미 값이 있으면 덮지 않는다.
  const later = new Date("2026-05-01T00:00:00Z");
  assert.equal(stampPush(approved, { draft: false, isNew: false }, later), approved);

  // 초안 없이 바로 올린 새 이슈는 approved_at 만 생긴다.
  const direct = parsePrd(stampPush(draft, { draft: false, isNew: true }, NOW)).times;
  assert.equal(direct.submitted_at, null);
  assert.equal(direct.approved_at, "2026-03-04T05:06:07Z");
});
