import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backtickPaths,
  excludedFromStructure,
  isClaudeMd,
  isPlanned,
  isUnder,
  missingLines,
} from "./claude-md-paths.ts";

test("backtickPaths 는 접두사로 시작하는 백틱 경로를 줄 번호와 함께 뽑는다", () => {
  const text = [
    "# 제목",
    "서버는 `apps/api/` 이고 설정은 `shared/config.ts` 에 있다.",
    "`dev-tools/src/cli.ts` 와 `.claude/agents/` 를 본다. `pnpm test` 는 경로가 아니다.",
    "```bash",
    "`apps/in-fence/` 는 코드 블록 안이다",
    "```",
    "`docs/ledger/`",
  ].join("\n");
  assert.deepEqual(backtickPaths("X.md", text), [
    { doc: "X.md", line: 2, path: "apps/api/" },
    { doc: "X.md", line: 3, path: "dev-tools/src/cli.ts" },
    { doc: "X.md", line: 3, path: ".claude/agents/" },
    { doc: "X.md", line: 7, path: "docs/ledger/" },
  ]);
});

test("backtickPaths 는 자리 표시가 든 백틱을 뺀다", () => {
  const text = "`docs/prd/<파일>.md`, `apps/{api,web}/x`, `apps/*/src`, `apps/web (화면)`, `apps/a|b`, `apps/web/src/`";
  assert.deepEqual(
    backtickPaths("X.md", text).map((ref) => ref.path),
    ["apps/web/src/"],
  );
});

test("excludedFromStructure 는 구조 표의 계획 줄과 로컬 줄만 고른다", () => {
  const text = [
    "## 구조",
    "",
    "| 경로 | 언어 | 책임 | 상태 |",
    "|---|---|---|---|",
    "| `apps/api/` | TypeScript | 서버 | 있음 |",
    "| `infra/` | TS | 인프라 | 계획 |",
    "| `apps/web/` | TypeScript | 웹 | 계획 |",
    "| `docs/prd/` | — | 캐시 | 로컬, gitignore |",
    "| `outputs/`, `data/` | — | 생성물 | 로컬, gitignore |",
    "",
    "## 다른 절",
    "| `apps/elsewhere/` | — | — | 계획 |",
  ].join("\n");
  assert.deepEqual(excludedFromStructure(text), {
    planned: ["infra/", "apps/web/"],
    local: ["docs/prd/", "outputs/", "data/"],
  });
});

test("isUnder 는 같은 경로와 그 아래를 고르고 끝의 / 는 따지지 않는다", () => {
  assert.ok(isUnder("infra/", ["infra/"]));
  assert.ok(isUnder("infra/index.ts", ["infra/"]));
  assert.ok(isUnder("apps/web", ["apps/web/"]));
  assert.ok(!isUnder("apps/", ["apps/web/"]));
  assert.ok(!isUnder("infrastructure/", ["infra/"]));
});

test("isPlanned 는 계획 경로의 아래와 그것을 품는 위 디렉터리를 고른다", () => {
  assert.ok(isPlanned("apps/web/src/main.tsx", ["apps/web/"]));
  assert.ok(isPlanned("apps/", ["apps/web/"]));
  assert.ok(!isPlanned("apps-old/", ["apps/web/"]));
  assert.ok(!isPlanned("apps/api/", ["apps/web/"]));
});

test("missingLines 는 문서와 줄과 경로를 적는다", () => {
  assert.deepEqual(missingLines([{ doc: "CLAUDE.md", line: 97, path: "apps/foo/" }]), [
    "`CLAUDE.md:97` → `apps/foo/` 없음",
  ]);
});

test("isClaudeMd 는 루트와 하위 디렉터리의 CLAUDE.md 만 고른다", () => {
  assert.ok(isClaudeMd("CLAUDE.md"));
  assert.ok(isClaudeMd("apps/api/CLAUDE.md"));
  assert.ok(!isClaudeMd("docs/NOT-CLAUDE.md.bak"));
  assert.ok(!isClaudeMd("apps/api/XCLAUDE.md"));
});
