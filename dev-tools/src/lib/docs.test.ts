import assert from "node:assert/strict";
import { test } from "node:test";

import { type Doc, parseDoc, validateDocs } from "./docs.ts";

const ADR = `---
id: ADR-0001
date: 2026-10-14
status: accepted
tags: [images, model, license]
related: [DEV-2026-10-13-image-model-trial]
---
# 이미지 모델은 지금 것을 유지한다

## 맥락

같은 프롬프트와 같은 시드로 후보 셋을 비교했다.

## 결정

- 지금 모델을 유지한다.
`;

const DEVLOG = `---
id: DEV-2026-10-13-image-model-trial
date: 2026-10-13
tags: [images, memory]
related: [ADR-0001]
---
# 상위 이미지 모델 셋을 돌려 본 기록

## 해 본 것

시드를 고정하고 열 벌을 돌렸다.
`;

test("ADR 의 머리말, 제목, 본문을 읽는다", () => {
  const doc = parseDoc(ADR, "docs/adr/0001-image-model.md");
  assert.equal(doc.id, "ADR-0001");
  assert.equal(doc.kind, "adr");
  assert.equal(doc.path, "docs/adr/0001-image-model.md");
  assert.equal(doc.title, "이미지 모델은 지금 것을 유지한다");
  assert.equal(doc.date, "2026-10-14");
  assert.equal(doc.status, "accepted");
  assert.deepEqual(doc.tags, ["images", "model", "license"]);
  assert.deepEqual(doc.related, ["DEV-2026-10-13-image-model-trial"]);
  assert.ok(doc.body.includes("후보 셋을 비교했다"));
  assert.ok(!doc.body.includes("id: ADR-0001"), "본문에 머리말이 섞이지 않는다");
});

test("일지는 devlog 이고 status 가 없으면 null 이다", () => {
  const doc = parseDoc(DEVLOG, "docs/devlog/2026-10-13-image-model-trial.md");
  assert.equal(doc.kind, "devlog");
  assert.equal(doc.id, "DEV-2026-10-13-image-model-trial");
  assert.equal(doc.status, null);
  assert.equal(doc.date, "2026-10-13");
  assert.deepEqual(doc.tags, ["images", "memory"]);
  assert.deepEqual(doc.related, ["ADR-0001"]);
  assert.equal(doc.title, "상위 이미지 모델 셋을 돌려 본 기록");
});

test("블록 목록으로 쓴 tags 와 related 도 읽는다", () => {
  const text = `---
id: ADR-0002
date: 2026-10-15
status: proposed
tags:
  - chat
  - persona
related:
  - ADR-0001
---
# 블록 목록
`;
  const doc = parseDoc(text, "docs/adr/0002-block.md");
  assert.deepEqual(doc.tags, ["chat", "persona"]);
  assert.deepEqual(doc.related, ["ADR-0001"]);
});

test("제목 줄이 없으면 파일 이름을 제목으로 쓰고, 빠진 칸은 비운다", () => {
  const doc = parseDoc("---\nid: ADR-0003\n---\n\n본문만 있다.\n", "docs/adr/0003-no-title.md");
  assert.equal(doc.title, "0003-no-title");
  assert.equal(doc.date, null);
  assert.equal(doc.status, null);
  assert.deepEqual(doc.tags, []);
  assert.deepEqual(doc.related, []);
});

test("제목은 첫 '# ' 줄이고 '## ' 는 제목이 아니다", () => {
  const doc = parseDoc("---\nid: ADR-0004\n---\n## 맥락\n\n# 진짜 제목\n", "docs/adr/0004-x.md");
  assert.equal(doc.title, "진짜 제목");
});

test("id 가 없으면 빈 문자열이다", () => {
  const doc = parseDoc("# 머리말 없음\n", "docs/devlog/2026-10-14-x.md");
  assert.equal(doc.id, "");
});

test("adr 도 devlog 도 아닌 경로는 거부한다", () => {
  assert.throws(() => parseDoc(ADR, "docs/prd/17-docs-index.md"), /docs\/adr|docs\/devlog/);
});

function doc(over: Partial<Doc>): Doc {
  return {
    id: "ADR-0001",
    kind: "adr",
    path: "docs/adr/0001-x.md",
    title: "제목",
    date: "2026-10-14",
    status: "accepted",
    tags: [],
    related: [],
    body: "",
    ...over,
  };
}

test("문제없는 집합은 빈 배열이다", () => {
  const docs = [
    parseDoc(ADR, "docs/adr/0001-image-model.md"),
    parseDoc(DEVLOG, "docs/devlog/2026-10-13-image-model-trial.md"),
  ];
  assert.deepEqual(validateDocs(docs), []);
  assert.deepEqual(validateDocs([]), []);
});

test("id 없음, id 중복, 없는 related 를 전부 모아 파일과 이유로 돌려준다", () => {
  const problems = validateDocs([
    doc({ id: "ADR-0001", path: "docs/adr/0001-a.md" }),
    doc({ id: "ADR-0001", path: "docs/adr/0001-b.md" }),
    doc({ id: "", path: "docs/adr/0002-c.md" }),
    doc({ id: "ADR-0003", path: "docs/adr/0003-d.md", related: ["ADR-0001", "ADR-9999"] }),
  ]);
  assert.equal(problems.length, 3);

  const missing = problems.find((p) => p.path === "docs/adr/0002-c.md");
  assert.ok(missing, "id 없는 파일을 짚는다");
  assert.match(missing.reason, /id/);

  const dup = problems.find((p) => p.path === "docs/adr/0001-b.md");
  assert.ok(dup, "중복된 두 번째 파일을 짚는다");
  assert.match(dup.reason, /ADR-0001/);
  assert.match(dup.reason, /docs\/adr\/0001-a\.md/, "먼저 쓴 파일을 함께 말한다");

  const dangling = problems.find((p) => p.path === "docs/adr/0003-d.md");
  assert.ok(dangling, "없는 id 를 가리키는 파일을 짚는다");
  assert.match(dangling.reason, /ADR-9999/);
});

test("없는 related 가 여럿이면 하나씩 따로 알린다", () => {
  const problems = validateDocs([doc({ related: ["X-1", "X-2"] })]);
  assert.equal(problems.length, 2);
});
