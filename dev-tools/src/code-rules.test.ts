// 레포 전체 검사: `@beside-pet/dev-checks/code-rules` 의 규칙을 git 이 추적하는 소스에 돌린다.
// 같은 몸체 함수와 대화 웹의 색 리터럴, 한글 리터럴은 경고(목록과 건수를 찍고 통과)다. 웹의 두 규칙은 재디자인 중에
// 새 코드가 들어오는 동안 경고로 두고, 웹 재디자인의 마지막 PRD 에서 실패로 올린다. Rust 서버의 기능 내부 경로와 `mod.rs` 자리, 큰 파일, 범용 타입은 실패다.
// Rust 서버 규칙은 `apps/server/src` 가 아직 없으면(추적되는 `.rs` 가 없으면) 볼 것이 없으므로 통과한다.
// 읽는 자리는 `project.config.json` 의 `codeRoots` 다. `data/`, `outputs/` 는 소스 자리가 아니므로 읽지 않는다.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  colorLiteralFindings,
  duplicateBodyReport,
  findingLine,
  genericTypeFindings,
  hangulLiteralFindings,
  internalUseFindings,
  isCodeFile,
  largeFileFindings,
  modPlacementFindings,
  report,
  SERVER_SRC,
} from "./lib/code-rules.ts";
import { readConfig, readTrackedSources, repoRoot, trackedFiles } from "./lib/repo.ts";

const root = repoRoot();
const { codeRoots } = readConfig(root);
const sources = readTrackedSources(root, codeRoots, (path) => isCodeFile(path, codeRoots));

test("기능 내부 경로 use (실패)", () => {
  const server = readTrackedSources(root, [SERVER_SRC], (path) => path.endsWith(".rs"));
  const found = internalUseFindings(server);
  assert.deepEqual(
    found.map(findingLine),
    [],
    "기능 밖에서 기능의 내부 모듈 경로를 썼습니다. 그 기능의 mod.rs 가 pub 으로 내보내는 이름을 씁니다",
  );
});

test("mod.rs 자리 (실패)", () => {
  const found = modPlacementFindings(trackedFiles(root, [SERVER_SRC]));
  assert.deepEqual(
    found.map(findingLine),
    [],
    "mod.rs 는 기능과 하위 기능의 뿌리에만 둡니다(모듈 파일은 x.rs, 하위 모듈은 x/)",
  );
});

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

test("대화 웹의 색 리터럴 (경고)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = colorLiteralFindings(sources);
  console.log(
    report("[경고] apps/web 의 hex 색, rgb()·hsl() 리터럴(토큰을 씁니다)", found.length, found.map(findingLine)),
  );
});

test("대화 웹 컴포넌트의 한글 리터럴 (경고)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = hangulLiteralFindings(sources);
  console.log(report("[경고] apps/web 의 .tsx 한글 리터럴(i18n 사전에 둡니다)", found.length, found.map(findingLine)));
});
