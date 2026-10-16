// docs/adr 와 docs/devlog 의 마크다운을 읽어 SQLite 색인(docs/docs.db)을 만들고 질의한다.
// 색인은 마크다운에서 만든 파생물이라 증분 없이 지우고 다시 만든다.
// 파싱과 집합 검증은 docs.ts 의 순수 함수가 한다.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";

import { type Doc, type DocKind, type DocProblem, parseDoc, validateDocs } from "./docs.ts";

const DOC_DIRS = ["docs/adr", "docs/devlog"] as const;

export type LoadResult = { ok: true; docs: Doc[] } | { ok: false; problems: DocProblem[] };

export type BuildResult = { ok: true; count: number; indexedAt: number } | { ok: false; problems: DocProblem[] };

export interface SearchHit {
  id: string;
  kind: DocKind;
  title: string;
  status: string | null;
  date: string | null;
  /** 일치 구절 한 줄. 일치한 낱말은 [ ] 로 감싼다. */
  snippet: string;
}

export interface ListFilter {
  kind?: DocKind;
  status?: string;
  tag?: string;
}

export interface ListItem {
  id: string;
  kind: DocKind;
  title: string;
  status: string | null;
  date: string | null;
  tags: string[];
}

/** related: 이 글이 가리킨다. related-by: 이 글을 가리킨다. tags:N: 태그 N 개를 공유한다(N >= 2). */
export type NeighborReason = "related" | "related-by" | `tags:${number}`;

export interface Neighbor {
  id: string;
  kind: DocKind;
  title: string;
  status: string | null;
  date: string | null;
  reasons: NeighborReason[];
}

/** 두 디렉터리의 .md 를 README.md 없이, 레포 루트 상대 경로로 정렬해 준다. */
export function docFiles(root: string): string[] {
  const files: string[] = [];
  for (const dir of DOC_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) {
      continue;
    }
    for (const name of readdirSync(abs)) {
      if (name.endsWith(".md") && name !== "README.md") {
        files.push(`${dir}/${name}`);
      }
    }
  }
  return files.sort();
}

/** 파일을 읽어 파싱하고 검증한다. 파일 하나의 파싱 예외도 문제로 모은다. */
export function loadDocs(root: string): LoadResult {
  const docs: Doc[] = [];
  const problems: DocProblem[] = [];
  for (const path of docFiles(root)) {
    try {
      docs.push(parseDoc(readFileSync(join(root, path), "utf8"), path));
    } catch (err) {
      problems.push({ path, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  problems.push(...validateDocs(docs));
  return problems.length > 0 ? { ok: false, problems } : { ok: true, docs };
}

/** 색인 DB 를 연다. ":memory:" 도 된다. 없는 파일이면 빈 DB 가 생긴다. */
export function openIndex(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath);
}

const SCHEMA = `
CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT,
  status TEXT,
  tags TEXT NOT NULL
);
CREATE TABLE relations (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE VIRTUAL TABLE docs_fts USING fts5(id UNINDEXED, title, body);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** 열린 DB 의 색인을 지우고 docs 로 다시 채운다. 검증은 하지 않는다(loadDocs 가 한다). */
export function writeIndex(db: DatabaseSync, docs: readonly Doc[], indexedAt: number = Date.now()): void {
  db.exec("BEGIN");
  try {
    db.exec(
      "DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS relations; DROP TABLE IF EXISTS docs_fts; DROP TABLE IF EXISTS meta;",
    );
    db.exec(SCHEMA);
    const insertDoc = db.prepare(
      "INSERT INTO docs (id, kind, path, title, date, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insertRel = db.prepare("INSERT OR IGNORE INTO relations (from_id, to_id) VALUES (?, ?)");
    const insertFts = db.prepare("INSERT INTO docs_fts (id, title, body) VALUES (?, ?, ?)");
    for (const d of docs) {
      insertDoc.run(d.id, d.kind, d.path, d.title, d.date, d.status, JSON.stringify(d.tags));
      for (const to of d.related) {
        insertRel.run(d.id, to);
      }
      insertFts.run(d.id, d.title, d.body);
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)").run(String(indexedAt));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** 파일을 읽고 검증해, 문제가 없을 때만 dbPath 를 지우고 새로 만든다. */
export function buildIndex(root: string, dbPath: string): BuildResult {
  const loaded = loadDocs(root);
  if (!loaded.ok) {
    return loaded;
  }
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const indexedAt = Date.now();
  const db = openIndex(dbPath);
  try {
    writeIndex(db, loaded.docs, indexedAt);
  } finally {
    db.close();
  }
  return { ok: true, count: loaded.docs.length, indexedAt };
}

/**
 * 색인이 지금 마크다운과 맞는지. DB 가 없거나 읽을 수 없거나, 파일 집합이 다르거나,
 * 어느 마크다운(README.md 제외)의 mtime 이 색인 시각보다 뒤면 false.
 */
export function isFresh(root: string, dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }
  let indexedAt: number;
  let indexedPaths: string[];
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare("SELECT value FROM meta WHERE key = 'indexed_at'").get() as { value: string } | undefined;
      if (row === undefined) {
        return false;
      }
      indexedAt = Number(row.value);
      indexedPaths = (db.prepare("SELECT path FROM docs").all() as { path: string }[]).map((r) => r.path);
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
  if (!Number.isFinite(indexedAt)) {
    return false;
  }
  const files = docFiles(root);
  const indexed = new Set(indexedPaths);
  if (files.length !== indexed.size || files.some((f) => !indexed.has(f))) {
    return false;
  }
  return files.every((f) => Math.floor(statSync(join(root, f)).mtimeMs) <= indexedAt);
}

/**
 * 사용자 질의를 FTS5 MATCH 식으로 바꾼다. 낱말마다 큰따옴표 구절로 감싸 문법 글자를 무력화하고,
 * 앞부분 일치(*)를 붙여 조사가 붙은 한글 어절("루프백에만")도 앞부분("루프백")으로 찾게 한다.
 * 글자나 숫자가 없는 낱말(토큰이 생기지 않는 것)은 버린다. 남는 낱말이 없으면 null.
 */
export function toMatchQuery(query: string): string | null {
  const terms = query
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .map((w) => `"${w.replace(/"/g, '""')}"*`);
  return terms.length > 0 ? terms.join(" ") : null;
}

/** 모든 낱말이 들어간 글을 bm25 순으로. */
export function search(db: DatabaseSync, query: string): SearchHit[] {
  const match = toMatchQuery(query);
  if (match === null) {
    return [];
  }
  const rows = db
    .prepare(
      `SELECT d.id, d.kind, d.title, d.status, d.date,
              snippet(docs_fts, -1, '[', ']', '…', 12) AS snippet
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.id
        WHERE docs_fts MATCH ?
        ORDER BY bm25(docs_fts), d.id`,
    )
    .all(match);
  return rows.map((r) => ({ ...docColumns(r), snippet: text(r, "snippet").replace(/\s+/g, " ").trim() }));
}

type Row = Record<string, SQLOutputValue>;

/** 행의 글 칸. 색인을 이 파일이 만들므로 다른 값이면 색인이 깨진 것이다. */
function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`색인의 ${column} 칸이 글이 아닙니다`);
  }
  return value;
}

function textOrNull(row: Row, column: string): string | null {
  return row[column] === null ? null : text(row, column);
}

function docKind(row: Row): DocKind {
  const kind = text(row, "kind");
  if (kind !== "adr" && kind !== "devlog") {
    throw new Error(`색인의 kind 칸을 모릅니다: ${kind}`);
  }
  return kind;
}

/** docs 테이블에서 함께 읽는 칸들. */
function docColumns(row: Row): Omit<ListItem, "tags"> {
  return {
    id: text(row, "id"),
    kind: docKind(row),
    title: text(row, "title"),
    status: textOrNull(row, "status"),
    date: textOrNull(row, "date"),
  };
}

/** 필터로 좁힌 목록을 id 순으로. tag 는 태그 하나와 정확히 같아야 한다. */
export function list(db: DatabaseSync, filter: ListFilter = {}): ListItem[] {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.kind !== undefined) {
    where.push("kind = ?");
    params.push(filter.kind);
  }
  if (filter.status !== undefined) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter.tag !== undefined) {
    where.push("EXISTS (SELECT 1 FROM json_each(docs.tags) WHERE value = ?)");
    params.push(filter.tag);
  }
  const sql = `SELECT id, kind, title, status, date, tags FROM docs${
    where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY id`;
  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => ({ ...docColumns(r), tags: JSON.parse(text(r, "tags")) as string[] }));
}

/**
 * 거리 1 의 이웃: related 로 가리키는 글, 가리키는 글, 태그를 둘 이상 공유하는 글. id 순.
 * 이웃이 없으면 빈 배열, 색인에 없는 id 면 null.
 */
export function neighbors(db: DatabaseSync, id: string): Neighbor[] | null {
  const all = list(db);
  const self = all.find((d) => d.id === id);
  if (self === undefined) {
    return null;
  }
  const out = (db.prepare("SELECT to_id FROM relations WHERE from_id = ?").all(id) as { to_id: string }[]).map(
    (r) => r.to_id,
  );
  const inc = (db.prepare("SELECT from_id FROM relations WHERE to_id = ?").all(id) as { from_id: string }[]).map(
    (r) => r.from_id,
  );
  const selfTags = new Set(self.tags);
  const result: Neighbor[] = [];
  for (const d of all) {
    if (d.id === id) {
      continue;
    }
    const reasons: NeighborReason[] = [];
    if (out.includes(d.id)) {
      reasons.push("related");
    }
    if (inc.includes(d.id)) {
      reasons.push("related-by");
    }
    const shared = new Set(d.tags.filter((t) => selfTags.has(t))).size;
    if (shared >= 2) {
      reasons.push(`tags:${shared}`);
    }
    if (reasons.length > 0) {
      result.push({ id: d.id, kind: d.kind, title: d.title, status: d.status, date: d.date, reasons });
    }
  }
  return result;
}
