// docs/adr 와 docs/devlog 의 마크다운 파싱과 집합 검증. 순수 함수만 둔다.
// 파일을 읽고 색인하는 일은 docs-db.ts 와 cli.ts 가 한다.

import { asList, asString, splitFrontmatter } from "./frontmatter.ts";

export type DocKind = "adr" | "devlog";

export interface Doc {
  /** 머리말의 id. 없으면 빈 문자열이고, validateDocs 가 문제로 알린다. */
  id: string;
  kind: DocKind;
  /** 레포 루트에서의 상대 경로. 예: docs/adr/0001-x.md */
  path: string;
  /** 본문의 첫 `# ` 줄. 없으면 확장자를 뗀 파일 이름. */
  title: string;
  date: string | null;
  /** 일지는 생략하므로 null 일 수 있다. */
  status: string | null;
  tags: string[];
  related: string[];
  /** 머리말을 뗀 본문 전체(제목 줄 포함). 검색 대상. */
  body: string;
}

export interface DocProblem {
  path: string;
  reason: string;
}

function kindOf(path: string): DocKind {
  if (/(^|\/)docs\/adr\//.test(path)) {
    return "adr";
  }
  if (/(^|\/)docs\/devlog\//.test(path)) {
    return "devlog";
  }
  throw new Error(`docs/adr 나 docs/devlog 아래의 파일이 아닙니다: ${path}`);
}

function titleOf(body: string, path: string): string {
  for (const line of body.split("\n")) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) {
      return m[1]!;
    }
  }
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/, "");
}

/** 마크다운 하나를 머리말, 제목, 본문으로 읽는다. */
export function parseDoc(text: string, path: string): Doc {
  const kind = kindOf(path);
  const { data, body } = splitFrontmatter(text);
  return {
    id: asString(data, "id")?.trim() ?? "",
    kind,
    path,
    title: titleOf(body, path),
    date: asString(data, "date") ?? null,
    status: asString(data, "status") ?? null,
    tags: asList(data, "tags"),
    related: asList(data, "related"),
    body,
  };
}

/** id 없음, id 중복, 없는 id 를 가리키는 related 를 전부 모아 돌려준다. 빈 배열이면 통과. */
export function validateDocs(docs: readonly Doc[]): DocProblem[] {
  const problems: DocProblem[] = [];
  const firstPath = new Map<string, string>();

  for (const doc of docs) {
    if (doc.id === "") {
      problems.push({ path: doc.path, reason: "머리말에 id 가 없습니다" });
      continue;
    }
    const seen = firstPath.get(doc.id);
    if (seen !== undefined) {
      problems.push({ path: doc.path, reason: `id ${doc.id} 가 ${seen} 와 겹칩니다` });
    } else {
      firstPath.set(doc.id, doc.path);
    }
  }

  for (const doc of docs) {
    for (const target of doc.related) {
      if (!firstPath.has(target)) {
        problems.push({ path: doc.path, reason: `related 의 ${target} 를 id 로 가진 글이 없습니다` });
      }
    }
  }
  return problems;
}
