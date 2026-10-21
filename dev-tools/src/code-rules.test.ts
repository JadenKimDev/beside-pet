// 레포 전체 검사: `@beside-pet/dev-checks/code-rules` 의 규칙을 git 이 추적하는 소스에 돌린다.
// 같은 몸체 함수는 경고(목록과 건수를 찍고 통과)다. 대화 웹의 색 리터럴, 한글 리터럴, Rust 서버의 기능 내부 경로와
// `mod.rs` 자리, 운영 화면의 FSD 레이어, 큰 파일, 범용 타입은 실패다.
// Rust 서버 규칙은 `apps/server/src` 가 아직 없으면(추적되는 `.rs` 가 없으면) 볼 것이 없으므로 통과한다.
// FSD 레이어 규칙도 `apps/backoffice` 에 추적되는 소스가 없으면 통과한다.
// 읽는 자리는 `project.config.json` 의 `codeRoots` 다. `data/`, `outputs/` 는 소스 자리가 아니므로 읽지 않는다.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BACKOFFICE_ROOT,
  colorLiteralFindings,
  duplicateBodyReport,
  findingLine,
  fsdLayerFindings,
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

test("backoffice FSD 레이어 (실패)", () => {
  const backoffice = sources.filter((file) => file.path.startsWith(BACKOFFICE_ROOT));
  const found = fsdLayerFindings(backoffice);
  assert.deepEqual(
    found.map(findingLine),
    [],
    "apps/backoffice 의 가져오기가 FSD 규칙을 어겼습니다. 위가 아래만 가져오고, 같은 레이어의 슬라이스끼리 가져오지 않고, 슬라이스 밖에서는 index 만 가져옵니다",
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

test("대화 웹의 색 리터럴 (실패)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = colorLiteralFindings(sources);
  assert.deepEqual(
    found.map(findingLine),
    [],
    "apps/web 에 hex 색, rgb()·hsl() 리터럴이 있습니다. globals.css 의 테마 블록에 토큰을 두고 토큰 클래스를 씁니다",
  );
});

test("대화 웹 컴포넌트의 한글 리터럴 (실패)", () => {
  assert.ok(sources.length > 0, "소스를 하나도 읽지 못했습니다");
  const found = hangulLiteralFindings(sources);
  assert.deepEqual(
    found.map(findingLine),
    [],
    "apps/web 의 .tsx 에 한글 리터럴이 있습니다. i18n 사전에 두고 키로 부릅니다",
  );
});
