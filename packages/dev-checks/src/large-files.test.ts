// 큰 파일 규칙의 단위 테스트.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTestPath, largeFiles } from "./large-files.ts";

describe("isTestPath", () => {
  it("tests/ 아래, tests.rs, *_tests.rs, *.test.ts(x) 는 테스트다", () => {
    for (const path of ["a/tests/b.rs", "tests/x.rs", "a/tests.rs", "a/id_tests.rs", "a/b.test.ts", "a/B.test.tsx"]) {
      assert.equal(isTestPath(path), true, path);
    }
  });

  it("제품 파일은 테스트가 아니다", () => {
    for (const path of ["a/b.rs", "a/testing.rs", "a/contest.rs", "a/b.ts", "a/latest/x.rs"]) {
      assert.equal(isTestPath(path), false, path);
    }
  });
});

describe("largeFiles", () => {
  const files = [
    { path: "a/big.rs", lines: 601 },
    { path: "a/edge.rs", lines: 600 },
    { path: "a/tests.rs", lines: 5000 },
    { path: "a/tests/x.rs", lines: 5000 },
    { path: "b/view.test.tsx", lines: 900 },
    { path: "b/view.tsx", lines: 700 },
  ];

  it("기본 문턱 600줄을 넘는 제품 파일만 돌려준다", () => {
    assert.deepEqual(largeFiles(files), [
      { path: "a/big.rs", lines: 601 },
      { path: "b/view.tsx", lines: 700 },
    ]);
  });

  it("문턱을 인자로 받는다", () => {
    assert.deepEqual(
      largeFiles(files, 650).map((f) => f.path),
      ["b/view.tsx"],
    );
  });
});
