import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { parseDoc } from "./docs.ts";
import { buildIndex, docFiles, isFresh, list, loadDocs, neighbors, openIndex, search, writeIndex } from "./docs-db.ts";

const ADR = `---
id: ADR-0001
date: 2026-10-14
status: accepted
tags: [images, model, license]
related: [DEV-2026-10-13-image-model-trial]
---
# 이미지 모델은 X-Model 을 유지한다

## 맥락

같은 프롬프트와 같은 시드로 후보 셋을 비교했다.

## 결정

- 지금 모델을 유지한다. 출시용 생성은 스텝을 깊게 한다.
`;

const DEVLOG = `---
id: DEV-2026-10-13-image-model-trial
date: 2026-10-13
tags: [images, memory]
---
# 상위 이미지 모델 셋을 돌려 본 기록

## 해 본 것

시드를 고정하고 열 벌을 돌렸다. 메모리가 모자라 멈췄다.
`;

const ADR2 = `---
id: ADR-0002
date: 2026-10-15
status: proposed
tags: [images, model, chat]
---
# 채팅 모델은 실행기 뒤에 둔다

모델은 바뀔 수 있으므로 실행기 모듈 뒤에 둔다.
`;

const ADR3 = `---
id: ADR-0003
date: 2026-10-16
status: accepted
tags: [infra]
---
# 인프라는 Pulumi 로 쓴다

포트는 루프백에만 연다.
`;

const tmpRoots: string[] = [];
after(() => {
  for (const dir of tmpRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "docs-db-"));
  tmpRoots.push(root);
  mkdirSync(join(root, "docs/adr"), { recursive: true });
  mkdirSync(join(root, "docs/devlog"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(root, path), text);
  }
  return root;
}

const FILES = {
  "docs/adr/README.md": "# 결정 기록\n\n머리말이 없는 안내 문서.\n",
  "docs/devlog/README.md": "# 개발 일지\n",
  "docs/adr/0001-image-model.md": ADR,
  "docs/adr/0002-chat-model.md": ADR2,
  "docs/adr/0003-infra.md": ADR3,
  "docs/devlog/2026-10-13-image-model-trial.md": DEVLOG,
};

function memoryIndex() {
  const db = openIndex(":memory:");
  writeIndex(db, [
    parseDoc(ADR, "docs/adr/0001-image-model.md"),
    parseDoc(ADR2, "docs/adr/0002-chat-model.md"),
    parseDoc(ADR3, "docs/adr/0003-infra.md"),
    parseDoc(DEVLOG, "docs/devlog/2026-10-13-image-model-trial.md"),
  ]);
  return db;
}

test("docFiles 는 두 디렉터리의 .md 를 README.md 없이 레포 상대 경로로 준다", () => {
  const root = makeRoot({ ...FILES, "docs/adr/notes.txt": "x" });
  assert.deepEqual(docFiles(root), [
    "docs/adr/0001-image-model.md",
    "docs/adr/0002-chat-model.md",
    "docs/adr/0003-infra.md",
    "docs/devlog/2026-10-13-image-model-trial.md",
  ]);
});

test("docFiles 는 디렉터리가 없어도 빈 배열을 준다", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-db-"));
  tmpRoots.push(root);
  assert.deepEqual(docFiles(root), []);
});

test("loadDocs 는 파싱 예외와 집합 검증의 문제를 파일 단위로 모은다", () => {
  const root = makeRoot({
    "docs/adr/0001-image-model.md": ADR, // related 가 가리키는 일지가 없다
    "docs/adr/0009-broken.md": "---\nid: ADR-0009\n# 머리말이 닫히지 않음\n",
  });
  const result = loadDocs(root);
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.problems.map((p) => p.path).sort();
  assert.deepEqual(paths, ["docs/adr/0001-image-model.md", "docs/adr/0009-broken.md"]);
  for (const p of result.problems) {
    assert.ok(p.reason.length > 0);
  }
});

test("buildIndex 는 문제가 있으면 DB 를 만들지 않고 문제를 돌려준다", () => {
  const root = makeRoot({ "docs/adr/0001-image-model.md": ADR });
  const dbPath = join(root, "docs/docs.db");
  const result = buildIndex(root, dbPath);
  assert.equal(result.ok, false);
  assert.equal(isFresh(root, dbPath), false);
});

test("buildIndex 는 색인을 만들고, 다시 돌리면 지우고 새로 만든다", () => {
  const root = makeRoot(FILES);
  const dbPath = join(root, "docs/docs.db");
  const first = buildIndex(root, dbPath);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.count, 4);
  const second = buildIndex(root, dbPath);
  assert.equal(second.ok, true);
  const db = openIndex(dbPath);
  try {
    assert.equal(list(db, {}).length, 4);
  } finally {
    db.close();
  }
});

test("isFresh: DB 가 없으면 stale, 만든 직후는 fresh", () => {
  const root = makeRoot(FILES);
  const dbPath = join(root, "docs/docs.db");
  assert.equal(isFresh(root, dbPath), false);
  buildIndex(root, dbPath);
  assert.equal(isFresh(root, dbPath), true);
});

test("isFresh: 마크다운이 색인 시각보다 나중에 바뀌면 stale", () => {
  const root = makeRoot(FILES);
  const dbPath = join(root, "docs/docs.db");
  buildIndex(root, dbPath);
  const future = new Date(Date.now() + 60_000);
  utimesSync(join(root, "docs/adr/0003-infra.md"), future, future);
  assert.equal(isFresh(root, dbPath), false);
});

test("isFresh: README.md 가 바뀌는 것은 신선도에 들지 않는다", () => {
  const root = makeRoot(FILES);
  const dbPath = join(root, "docs/docs.db");
  buildIndex(root, dbPath);
  const future = new Date(Date.now() + 60_000);
  utimesSync(join(root, "docs/adr/README.md"), future, future);
  assert.equal(isFresh(root, dbPath), true);
});

test("isFresh: 파일이 지워지거나 더해지면 stale", () => {
  const root = makeRoot(FILES);
  const dbPath = join(root, "docs/docs.db");
  buildIndex(root, dbPath);
  rmSync(join(root, "docs/adr/0003-infra.md"));
  assert.equal(isFresh(root, dbPath), false);

  buildIndex(root, dbPath);
  assert.equal(isFresh(root, dbPath), true);
  const past = new Date(Date.now() - 3_600_000);
  const added = join(root, "docs/adr/0004-new.md");
  writeFileSync(added, ADR3.replace("ADR-0003", "ADR-0004"));
  utimesSync(added, past, past);
  assert.equal(isFresh(root, dbPath), false);
});

test("search: FTS5 문법 글자가 섞인 낱말도 깨지지 않고 찾는다", () => {
  const db = memoryIndex();
  const hits = search(db, "X-Model");
  assert.equal(hits[0]?.id, "ADR-0001");
  assert.equal(hits[0]?.kind, "adr");
  assert.equal(hits[0]?.status, "accepted");
  assert.equal(hits[0]?.date, "2026-10-14");
  assert.ok(hits[0]?.title.includes("X-Model"));
  assert.ok(!hits[0]?.snippet.includes("\n"));
  for (const q of ['"', "a*b", "-", "(x", "NOT", 'say "hi"', "  "]) {
    assert.doesNotThrow(() => search(db, q), q);
  }
  assert.deepEqual(search(db, "   "), []);
});

test("search: 여러 낱말은 모두 들어간 글만 bm25 순으로 준다", () => {
  const db = memoryIndex();
  const hits = search(db, "시드 열");
  assert.deepEqual(
    hits.map((h) => h.id),
    ["DEV-2026-10-13-image-model-trial"],
  );
  assert.ok(hits[0]!.snippet.includes("시드"));
  const many = search(db, "모델");
  assert.ok(many.length >= 2);
});

test("search: 한글은 공백 단위로 잘리고, 조사가 붙은 어절도 앞부분으로 찾는다", () => {
  const db = memoryIndex();
  // "실행기" 는 본문에 "실행기" 그대로 있다
  assert.deepEqual(
    search(db, "실행기").map((h) => h.id),
    ["ADR-0002"],
  );
  // "루프백에만" 의 앞부분 "루프백" 으로도 찾는다(앞부분 일치)
  assert.deepEqual(
    search(db, "루프백").map((h) => h.id),
    ["ADR-0003"],
  );
  // 어절의 가운데와 뒷부분은 찾지 못한다: "프백" 은 어떤 토큰의 앞부분도 아니다
  assert.deepEqual(search(db, "프백"), []);
});

test("list: 필터 없이 id 순, kind, status, tag 로 좁힌다", () => {
  const db = memoryIndex();
  assert.deepEqual(
    list(db, {}).map((d) => d.id),
    ["ADR-0001", "ADR-0002", "ADR-0003", "DEV-2026-10-13-image-model-trial"],
  );
  assert.deepEqual(
    list(db, { kind: "devlog" }).map((d) => d.id),
    ["DEV-2026-10-13-image-model-trial"],
  );
  assert.deepEqual(
    list(db, { status: "accepted" }).map((d) => d.id),
    ["ADR-0001", "ADR-0003"],
  );
  assert.deepEqual(
    list(db, { tag: "images" }).map((d) => d.id),
    ["ADR-0001", "ADR-0002", "DEV-2026-10-13-image-model-trial"],
  );
  assert.deepEqual(
    list(db, { kind: "adr", tag: "model", status: "proposed" }).map((d) => d.id),
    ["ADR-0002"],
  );
  const first = list(db, {})[0]!;
  assert.deepEqual(first.tags, ["images", "model", "license"]);
  assert.equal(first.title, "이미지 모델은 X-Model 을 유지한다");
  const dev = list(db, { kind: "devlog" })[0]!;
  assert.equal(dev.status, null);
});

test("list: tag 는 부분 문자열이 아니라 태그 하나와 같아야 한다", () => {
  const db = memoryIndex();
  assert.deepEqual(list(db, { tag: "image" }), []);
});

test("neighbors: related 양방향과 태그 둘 이상 공유를 이유와 함께 준다", () => {
  const db = memoryIndex();
  const fromAdr = neighbors(db, "ADR-0001");
  assert.ok(fromAdr !== null);
  assert.deepEqual(
    fromAdr.map((n) => [n.id, n.reasons]),
    [
      ["ADR-0002", ["tags:2"]],
      ["DEV-2026-10-13-image-model-trial", ["related"]],
    ],
  );
  const fromDev = neighbors(db, "DEV-2026-10-13-image-model-trial");
  assert.deepEqual(
    fromDev?.map((n) => [n.id, n.reasons]),
    [["ADR-0001", ["related-by"]]],
  );
  assert.equal(fromAdr[1]!.kind, "devlog");
  assert.equal(fromAdr[1]!.title, "상위 이미지 모델 셋을 돌려 본 기록");
});

test("neighbors: 이웃이 없으면 빈 배열, 모르는 id 면 null", () => {
  const db = memoryIndex();
  assert.deepEqual(neighbors(db, "ADR-0003"), []);
  assert.equal(neighbors(db, "ADR-9999"), null);
});
