// 레포 전체 검사: `@beside-pet/dev-checks/code-rules` 의 규칙을 git 이 추적하는 소스에 돌린다.
// 같은 몸체 함수는 경고(목록과 건수를 찍고 통과), 큰 파일과 범용 타입은 실패다.
// 읽는 자리는 `project.config.json` 의 `codeRoots` 다. `data/`, `outputs/` 는 소스 자리가 아니므로 읽지 않는다.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  duplicateBodyReport,
  findingLine,
  genericTypeFindings,
  isCodeFile,
  largeFileFindings,
  report,
} from "./lib/code-rules.ts";
import { readConfig, readTrackedSources, repoRoot } from "./lib/repo.ts";

const root = repoRoot();
const { codeRoots } = readConfig(root);
const sources = readTrackedSources(root, codeRoots, (path) => isCodeFile(path, codeRoots));

test("큰 파일 (실패)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = largeFileFindings(sources);
  assert.deepEqual(found.map(findingLine), [], "600줄 넘는 제품 파일이 있습니다. 책임으로 가릅니다");
});

test("같은 몸체 함수 (경고)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const { groups, lines } = duplicateBodyReport(sources);
  console.log(report("[경고] 다른 이름의 같은 몸체 함수 묶음", groups, lines));
});

test("범용 타입 (실패)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = genericTypeFindings(sources);
  assert.deepEqual(found.map(findingLine), [], "범용 타입(any, as unknown as, 허용 밖의 unknown, dyn Any)을 썼습니다");
});
