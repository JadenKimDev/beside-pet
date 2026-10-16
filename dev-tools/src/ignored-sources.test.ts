// 레포 전체 검사: 추적되는 소스가 가리키는 파일 가운데 git 이 무시하는 것이 있으면 실패한다.
// `pnpm test` 가 `pnpm -r --if-present test` 로 이 파일을 돈다.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ignoredPointerLines, type Pointer, pointers, SOURCE_ROOTS, sourceKind } from "./lib/ignored-sources.ts";
import { ignoredPaths, repoRoot, trackedFiles } from "./lib/repo.ts";

test("추적되는 소스가 가리키는 파일 가운데 git 이 무시하는 것이 없다", () => {
  const root = repoRoot();
  const isFile = (path: string): boolean => {
    try {
      return statSync(join(root, path)).isFile();
    } catch {
      return false;
    }
  };
  const found: Pointer[] = [];
  for (const file of trackedFiles(root, SOURCE_ROOTS)) {
    if (sourceKind(file) === null || !isFile(file)) {
      continue;
    }
    found.push(...pointers(file, readFileSync(join(root, file), "utf8"), isFile));
  }
  assert.ok(found.length > 0, "가리킴을 하나도 찾지 못했습니다 — 검사가 소스를 읽지 못하고 있습니다");
  const lines = ignoredPointerLines(found, ignoredPaths(root, [...new Set(found.map((p) => p.to))]));
  assert.deepEqual(
    lines,
    [],
    `git 이 무시하는 파일을 소스가 가리킵니다. .gitignore 규칙을 좁히세요:\n${lines.join("\n")}`,
  );
});
