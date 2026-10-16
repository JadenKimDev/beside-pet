// 레포 전체 검사: git 이 추적하는 `CLAUDE.md` 들이 백틱으로 가리키는 레포 경로가 실제로 있는가.
// `pnpm test` 가 `pnpm -r --if-present test` 로 이 파일을 돈다.
//
// 빼는 것: 루트 `CLAUDE.md` 의 "## 구조" 표에서 상태가 "계획"인 경로와 그 아래, 그것을 품는 위 디렉터리(아직 없다),
// 상태가 "로컬"인 경로와 git 이 무시하는 경로(체크아웃마다 있을 수도 없을 수도 있다).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  backtickPaths,
  excludedFromStructure,
  isClaudeMd,
  isPlanned,
  isUnder,
  missingLines,
  type PathRef,
} from "./lib/claude-md-paths.ts";
import { ignoredPaths, repoRoot, trackedFiles } from "./lib/repo.ts";

test("CLAUDE.md 가 가리키는 경로가 실제로 있다", () => {
  const root = repoRoot();
  const docs = trackedFiles(root, []).filter((path) => isClaudeMd(path) && existsSync(join(root, path)));
  assert.ok(docs.includes("CLAUDE.md"), "루트 CLAUDE.md 가 git 에 추적되지 않습니다");
  const texts = new Map(docs.map((doc) => [doc, readFileSync(join(root, doc), "utf8")]));
  const { planned, local } = excludedFromStructure(texts.get("CLAUDE.md")!);
  assert.ok(planned.length > 0 || local.length > 0, "루트 CLAUDE.md 의 구조 표를 읽지 못했습니다");

  const refs: PathRef[] = [];
  for (const [doc, text] of texts) {
    refs.push(...backtickPaths(doc, text));
  }
  assert.ok(refs.length > 0, "경로를 하나도 찾지 못했습니다 — 검사가 문서를 읽지 못하고 있습니다");

  const candidates = refs.filter((ref) => !isPlanned(ref.path, planned) && !isUnder(ref.path, local));
  const absent = candidates.filter((ref) => !existsSync(join(root, ref.path)));
  const ignored = ignoredPaths(root, [...new Set(absent.map((ref) => ref.path))]);
  const missing = absent.filter((ref) => !ignored.has(ref.path));
  const lines = missingLines(missing);
  assert.deepEqual(lines, [], `CLAUDE.md 가 없는 경로를 가리킵니다:\n${lines.join("\n")}`);
});
