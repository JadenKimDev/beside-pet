// 레포 검사: 사용자에게 보이는 개발 기록(`showcase/dev-notes.json`)의 모양과 글을 본다(#36).
// 규칙은 `lib/showcase/dev-notes.ts` 에 있다. `pnpm test` 가 `pnpm -r --if-present test` 로 이 파일을 돈다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { repoRoot } from "../lib/repo.ts";
import { findingLines, parseDevNotes } from "../lib/showcase/dev-notes.ts";

test("개발 기록의 항목이 모양을 지키고 금지어와 코드 이름이 없다", () => {
  const text = readFileSync(join(repoRoot(), "showcase", "dev-notes.json"), "utf8");
  const lines = findingLines(parseDevNotes(text));
  assert.deepEqual(lines, [], `showcase/dev-notes.json 을 사용자의 말로 고치세요:\n${lines.join("\n")}`);
});
