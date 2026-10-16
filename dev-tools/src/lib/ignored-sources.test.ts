import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ignoredPointerLines,
  importCandidates,
  pointers,
  relativeImports,
  rustModCandidates,
  rustModNames,
  sourceKind,
} from "./ignored-sources.ts";

test("sourceKind 는 소스 디렉터리의 Rust 와 스크립트만 본다", () => {
  assert.equal(sourceKind("apps/api/src/main.rs"), "rust");
  assert.equal(sourceKind("apps/web/src/app/Shell.tsx"), "script");
  assert.equal(sourceKind("packages/shared/src/generated/x.d.ts"), null);
  assert.equal(sourceKind("docs/notes.ts"), null);
  assert.equal(sourceKind("apps/api/migrations/0001.sql"), null);
});

test("rustModNames 는 선언만 있는 mod 를 고르고 몸이 있는 mod 와 주석은 건너뛴다", () => {
  const text = [
    "mod api;",
    "pub mod store;",
    "pub(crate) mod rules ;",
    "#[cfg(test)] mod tests;",
    "#[cfg(test)]",
    "mod more_tests;",
    "mod inline { fn f() {} }",
    "// mod commented;",
    "/* mod blocked; */",
    "mod r#type;",
  ].join("\n");
  assert.deepEqual(rustModNames(text), ["api", "store", "rules", "tests", "more_tests", "type"]);
});

test("rustModCandidates 는 mod.rs, main.rs 와 일반 파일의 자리를 가른다", () => {
  assert.deepEqual(rustModCandidates("apps/api/src/orders/models.rs", "tests"), [
    "apps/api/src/orders/models/tests.rs",
    "apps/api/src/orders/models/tests/mod.rs",
  ]);
  assert.deepEqual(rustModCandidates("apps/api/src/orders/mod.rs", "models"), [
    "apps/api/src/orders/models.rs",
    "apps/api/src/orders/models/mod.rs",
  ]);
  assert.deepEqual(rustModCandidates("apps/api/src/main.rs", "app")[0], "apps/api/src/app.rs");
  assert.deepEqual(rustModCandidates("apps/api/tests/feature_orders.rs", "common")[0], "apps/api/tests/common.rs");
});

test("relativeImports 는 상대 지정자만 모은다", () => {
  const text = [
    'import { a } from "./a.ts";',
    "import b from '../b';",
    'export * from "./c";',
    'import "./side.css";',
    'const d = await import("./d");',
    'const e = require("../e.js");',
    'import { f } from "@example/shared";',
    'import g from "node:fs";',
  ].join("\n");
  assert.deepEqual(relativeImports(text).sort(), ["../b", "../e.js", "./a.ts", "./c", "./d", "./side.css"]);
});

test("importCandidates 는 그대로, .js→.ts, 확장자, index 순으로 찾는다", () => {
  const list = importCandidates("apps/web/src/app/Shell.tsx", "../shared/api");
  assert.equal(list[0], "apps/web/src/shared/api");
  assert.ok(list.indexOf("apps/web/src/shared/api.ts") < list.indexOf("apps/web/src/shared/api/index.ts"));
  assert.deepEqual(importCandidates("dev-tools/src/cli.ts", "./lib/repo.js").slice(0, 3), [
    "dev-tools/src/lib/repo.js",
    "dev-tools/src/lib/repo.ts",
    "dev-tools/src/lib/repo.tsx",
  ]);
  assert.equal(importCandidates("apps/web/src/a.ts", "./raw.txt?raw")[0], "apps/web/src/raw.txt");
});

test("pointers 는 처음으로 있는 후보를 고르고 없는 것은 건너뛴다", () => {
  const files = new Set(["apps/api/src/orders/models/tests.rs", "apps/web/src/shared/api/index.ts"]);
  const isFile = (p: string) => files.has(p);
  assert.deepEqual(pointers("apps/api/src/orders/models.rs", "#[cfg(test)]\nmod tests;\nmod gone;\n", isFile), [
    { from: "apps/api/src/orders/models.rs", to: "apps/api/src/orders/models/tests.rs" },
  ]);
  assert.deepEqual(pointers("apps/web/src/app/Shell.tsx", 'import { api } from "../shared/api";', isFile), [
    { from: "apps/web/src/app/Shell.tsx", to: "apps/web/src/shared/api/index.ts" },
  ]);
  assert.deepEqual(
    pointers("docs/a.ts", 'import "./b";', () => true),
    [],
  );
});

test("ignoredPointerLines 는 무시되는 파일만 경로와 함께 보인다", () => {
  const found = [
    { from: "apps/api/src/orders/models.rs", to: "apps/api/src/orders/models/tests.rs" },
    { from: "apps/api/src/orders/mod.rs", to: "apps/api/src/orders/models.rs" },
  ];
  assert.deepEqual(ignoredPointerLines(found, new Set(["apps/api/src/orders/models/tests.rs"])), [
    "apps/api/src/orders/models/tests.rs  (가리키는 곳: apps/api/src/orders/models.rs)",
  ]);
  assert.deepEqual(ignoredPointerLines(found, new Set()), []);
});
