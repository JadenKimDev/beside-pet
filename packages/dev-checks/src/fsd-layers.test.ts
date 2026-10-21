// 운영 화면의 FSD 규칙(레이어 방향, 같은 레이어 교차, 공개 API)의 단위 테스트. 소스는 지어낸 글이다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fsdLayerViolations, importSpecifiers, inFsdScope } from "./fsd-layers.ts";

const check = (path: string, source: string) =>
  fsdLayerViolations([{ path, source }]).map((v) => ({ line: v.line, specifier: v.specifier, rule: v.rule }));

describe("레이어 방향", () => {
  it("아래 레이어가 위 레이어를 가져오면 어김이다", () => {
    const found = check("src/entities/account/model/types.ts", 'import { login } from "@/features/login";\n');
    assert.equal(found.length, 1);
    assert.equal(found[0]!.line, 1);
    assert.equal(found[0]!.specifier, "@/features/login");
    assert.match(found[0]!.rule, /entities 레이어는 위 레이어 features/);
  });

  it("상대 경로로 위 레이어를 가져와도 어김이다", () => {
    const found = check("src/shared/ui/Button.tsx", 'import { Shell } from "../../widgets/app-shell";\n');
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /shared 레이어는 위 레이어 widgets/);
  });
});

describe("같은 레이어 교차", () => {
  it("슬라이스가 같은 레이어의 다른 슬라이스를 가져오면 어김이다", () => {
    const found = check("src/features/login/ui/LoginForm.tsx", 'import { LogoutButton } from "@/features/logout";\n');
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /features\/login 는 같은 레이어의 슬라이스 features\/logout/);
  });

  it("상대 경로의 교차도 잡는다", () => {
    const found = check("src/entities/account/index.ts", 'export * from "../viewer";\n');
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /같은 레이어의 슬라이스 entities\/viewer/);
  });
});

describe("슬라이스 공개 API", () => {
  it("슬라이스 밖에서 내부 경로를 가져오면 어김이다", () => {
    const found = check(
      "src/features/issue-account/model/issue.ts",
      'import type { Account } from "@/entities/account/model/types";\n',
    );
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /entities\/account 밖에서는 entities\/account 의 index 만/);
  });

  it("shared 는 세그먼트가 공개 단위라 세그먼트의 내부 경로는 어김이다", () => {
    const found = check("src/entities/viewer/api/me.ts", 'import { request } from "@/shared/api/client";\n');
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /shared\/api 밖에서는 shared\/api 의 index 만/);
  });

  it("라우트 파일도 공개 API 를 지킨다", () => {
    const found = check(
      "app/(dashboard)/models/page.tsx",
      'import { ModelsView } from "@/views/models/ui/ModelsView";\n',
    );
    assert.equal(found.length, 1);
    assert.match(found[0]!.rule, /views\/models 밖에서는/);
  });
});

describe("허용", () => {
  it("아래 레이어의 index 를 별칭으로 가져오는 것", () => {
    const source = [
      'import { Shell } from "@/widgets/app-shell";',
      'import { LoginForm } from "@/features/login";',
      'import type { Account } from "@/entities/account";',
      'import { request } from "@/shared/api";',
      'import { formatDate } from "@/shared/lib/index";',
    ].join("\n");
    assert.deepEqual(check("src/views/accounts/ui/AccountsView.tsx", source), []);
  });

  it("같은 슬라이스 안의 상대 경로", () => {
    const index = [
      'export type { Account } from "./model/types";',
      'export { AccountBadge } from "./ui/AccountBadge";',
    ].join("\n");
    assert.deepEqual(check("src/entities/account/index.ts", index), []);
    assert.deepEqual(
      check("src/entities/account/ui/AccountBadge.tsx", 'import type { Account } from "../model/types";\n'),
      [],
    );
  });

  it("shared 의 세그먼트끼리, app 의 세그먼트끼리", () => {
    assert.deepEqual(check("src/shared/ui/Number.tsx", 'import { formatNumber } from "@/shared/lib";\n'), []);
    assert.deepEqual(check("src/shared/ui/Number.tsx", 'import { formatNumber } from "../lib";\n'), []);
    assert.deepEqual(check("src/app/providers/index.tsx", 'import "@/app/styles/globals.css";\n'), []);
  });

  it("라우트 파일은 레이어 app 과 같아 어떤 레이어든 index 로 가져온다", () => {
    const source = [
      'import { Providers } from "@/app/providers";',
      'import "@/app/styles/globals.css";',
      'import { LoginView } from "@/views/login";',
      'import Link from "next/link";',
    ].join("\n");
    assert.deepEqual(check("app/layout.tsx", source), []);
  });

  it("테스트 파일과 src 밖 파일은 보지 않는다", () => {
    const source = 'import { x } from "@/features/login/model/x";\n';
    assert.deepEqual(check("src/entities/account/model/types.test.ts", source), []);
    assert.deepEqual(check("next.config.ts", source), []);
    assert.equal(inFsdScope("src/shared/api/client.ts"), true);
    assert.equal(inFsdScope("src/shared/api/client.test.ts"), false);
    assert.equal(inFsdScope("app/page.tsx"), true);
    assert.equal(inFsdScope("vitest.config.ts"), false);
  });
});

describe("importSpecifiers", () => {
  it("import, export from, 동적 import 를 줄과 함께 뽑고 주석과 문자열 안은 뺀다", () => {
    const source = [
      "import {",
      "  a,",
      '} from "@/shared/api";',
      '// import { b } from "@/features/login";',
      "const s = \"import x from '@/features/logout'\";",
      'export * from "./ui";',
      'const m = await import("@/views/models");',
      'import type { T } from "../model/types";',
      'import "./side-effect";',
    ].join("\n");
    assert.deepEqual(importSpecifiers(source), [
      { specifier: "@/shared/api", line: 3 },
      { specifier: "./ui", line: 6 },
      { specifier: "@/views/models", line: 7 },
      { specifier: "../model/types", line: 8 },
      { specifier: "./side-effect", line: 9 },
    ]);
  });
});
