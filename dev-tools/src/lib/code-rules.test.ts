import assert from "node:assert/strict";
import { test } from "node:test";

import {
  duplicateBodyReport,
  findingLine,
  genericTypeFindings,
  isCodeFile,
  largeFileFindings,
  report,
} from "./code-rules.ts";

const body = (name: string) =>
  `function ${name}(xs: number[]): number {\n${Array.from({ length: 12 }, (_, i) => `  const v${i} = xs[${i}] ?? 0;`).join("\n")}\n  return 0;\n}\n`;

test("isCodeFile: 검사하는 소스 자리와 언어만 고른다", () => {
  assert.equal(isCodeFile("apps/api/src/app.ts"), true);
  assert.equal(isCodeFile("apps/web/src/main.tsx"), true);
  assert.equal(isCodeFile("dev-tools/src/cli.ts"), true);
  assert.equal(isCodeFile("packages/dev-checks/src/code-rules.ts"), true);
  assert.equal(isCodeFile("packages/shared/src/generated/User.ts"), false);
  assert.equal(isCodeFile("apps/web/src/vite-env.d.ts"), false);
  assert.equal(isCodeFile("apps/web/src/style.css"), false);
  assert.equal(isCodeFile("apps/api/migrations/0001.sql"), false);
  assert.equal(isCodeFile("dev-tools/scripts/x.ts"), false);
  assert.equal(isCodeFile("data/x.ts"), false);
  // 자리는 설정으로 바꾼다.
  assert.equal(isCodeFile("apps/web/src/main.tsx", ["apps/api/src/"]), false);
  assert.equal(isCodeFile("apps/api/src/app.ts", ["apps/api/src/"]), true);
});

test("largeFileFindings: 600줄 넘는 제품 파일만, 줄 수를 적는다", () => {
  const long = "x\n".repeat(700);
  const found = largeFileFindings([
    { path: "apps/web/src/big.ts", source: long },
    { path: "apps/web/src/big.test.ts", source: long },
    { path: "apps/web/src/small.ts", source: "x\n" },
  ]);
  assert.deepEqual(
    found.map((f) => f.file),
    ["apps/web/src/big.ts"],
  );
  assert.match(found[0]!.note, /700줄/);
});

test("duplicateBodyReport: 묶음 수와 묶음마다 위치들", () => {
  const { groups, lines } = duplicateBodyReport([
    { path: "apps/web/src/a.ts", source: body("alpha") },
    { path: "apps/admin/src/b.ts", source: body("beta") },
  ]);
  assert.equal(groups, 1);
  assert.ok(lines.some((l) => l.includes("apps/web/src/a.ts:1") && l.includes("alpha")));
  assert.ok(lines.some((l) => l.includes("apps/admin/src/b.ts:1") && l.includes("beta")));
});

test("genericTypeFindings: any 와 as unknown as 를 찾고 위치를 적는다", () => {
  const found = genericTypeFindings([
    { path: "dev-tools/src/a.ts", source: "const a = 1;\nconst b = a as unknown as string;\n" },
    { path: "apps/web/src/c.ts", source: "export const c: number = 1;\n" },
  ]);
  assert.equal(found.length, 1);
  assert.equal(findingLine(found[0]!).startsWith("dev-tools/src/a.ts:2  "), true);
});

test("findingLine 과 report: `파일:줄  설명`, 머리에 건수", () => {
  assert.equal(findingLine({ file: "a.ts", line: 3, note: "설명" }), "a.ts:3  설명");
  assert.equal(findingLine({ file: "a.ts", note: "설명" }), "a.ts  설명");
  assert.equal(report("큰 파일", 2, ["x", "y"]), "큰 파일: 2건\nx\ny");
  assert.equal(report("큰 파일", 0, []), "큰 파일: 0건");
});
