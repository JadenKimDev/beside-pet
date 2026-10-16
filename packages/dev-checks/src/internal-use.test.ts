// 기능 내부 경로 `use` 규칙의 단위 테스트. 경로는 서버 크레이트의 `src` 기준이다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { featureDirs, internalUseViolations } from "./internal-use.ts";

const PATHS = [
  "main.rs",
  "app.rs",
  "conversation/mod.rs",
  "conversation/chat.rs",
  "conversation/chat/tests.rs",
  "conversation/store.rs",
  "introduction/mod.rs",
  "introduction/rules.rs",
  "introduction/affinity/mod.rs",
  "introduction/affinity/judge.rs",
  "introduction/affinity/store.rs",
  "account/mod.rs",
  "account/api.rs",
];

function check(path: string, source: string) {
  return internalUseViolations([{ path, source }], PATHS);
}

describe("internalUseViolations", () => {
  it("다른 기능의 내부 모듈을 use 하면 파일·줄·경로·주인을 돌려준다", () => {
    const found = check("introduction/rules.rs", "//! 규칙\n\nuse crate::account::api::User;\n");
    assert.deepEqual(
      found.map(({ file, line, usePath, owner }) => ({ file, line, usePath, owner })),
      [{ file: "introduction/rules.rs", line: 3, usePath: "crate::account::api::User", owner: "account" }],
    );
    assert.ok(found[0]!.rule.length > 0);
  });

  it("같은 기능 안의 내부 경로는 허용한다", () => {
    assert.deepEqual(check("conversation/chat.rs", "use crate::conversation::store::save;\n"), []);
    assert.deepEqual(check("conversation/chat/tests.rs", "use crate::conversation::chat::build;\n"), []);
  });

  it("기능 mod.rs 의 pub 항목은 허용한다", () => {
    assert.deepEqual(
      check("introduction/rules.rs", "use crate::account::User;\nuse crate::account::{self, require_user};\n"),
      [],
    );
  });

  it("중괄호로 묶은 use 를 풀어 내부 모듈만 잡는다", () => {
    const source = "use crate::conversation::{self, chat, store::{save, Row}};\n";
    const found = check("app.rs", source);
    assert.deepEqual(
      found.map((v) => v.usePath),
      ["crate::conversation::chat", "crate::conversation::store::save", "crate::conversation::store::Row"],
    );
    assert.ok(found.every((v) => v.line === 1 && v.owner === "conversation"));
  });

  it("여러 줄의 use 와 pub use, as 별칭을 다룬다", () => {
    const source = ["//! x", "pub(crate) use crate::account::{", "    api::User as U,", "};"].join("\n");
    const found = check("introduction/rules.rs", source);
    assert.deepEqual(
      found.map((v) => ({ line: v.line, usePath: v.usePath })),
      [{ line: 2, usePath: "crate::account::api::User" }],
    );
  });

  it("기능 밖 파일(app.rs, main.rs)은 모든 기능의 내부 경로가 어김이다", () => {
    assert.equal(check("app.rs", "use crate::account::api::router;\n").length, 1);
    assert.equal(check("main.rs", "use crate::introduction::rules::score;\n").length, 1);
  });

  it("코드 안에 직접 쓴 내부 경로도 잡는다", () => {
    const source = "fn f() {\n    let x = crate::account::api::User::new();\n}\n";
    const found = check("introduction/rules.rs", source);
    assert.deepEqual(
      found.map((v) => ({ line: v.line, usePath: v.usePath })),
      [{ line: 2, usePath: "crate::account::api::User::new" }],
    );
  });

  it("주석과 문자열 안의 경로는 보지 않는다", () => {
    const source = '// use crate::account::api::User;\nconst S: &str = "crate::account::api::x";\n';
    assert.deepEqual(check("introduction/rules.rs", source), []);
  });

  it("하위 기능의 내부 모듈은 하위 기능 밖에서 쓰면 어김이다", () => {
    const found = check("introduction/rules.rs", "use crate::introduction::affinity::judge::Verdict;\n");
    assert.deepEqual(
      found.map((v) => v.owner),
      ["introduction/affinity"],
    );
    assert.deepEqual(check("introduction/rules.rs", "use crate::introduction::affinity::Score;\n"), []);
    assert.deepEqual(
      check("introduction/affinity/store.rs", "use crate::introduction::affinity::judge::Verdict;\n"),
      [],
    );
  });

  it("다른 기능에서 하위 기능의 내부를 쓰면 바깥 기능 단위로 한 번만 잡는다", () => {
    const found = check("conversation/chat.rs", "use crate::introduction::affinity::judge::Verdict;\n");
    assert.deepEqual(
      found.map((v) => v.owner),
      ["introduction"],
    );
  });

  it("super·self 경로와 $crate 는 보지 않는다", () => {
    const source = "use super::store::save;\nuse self::x::y;\nmacro_rules! m { () => { $crate::account::api::f() } }\n";
    assert.deepEqual(check("introduction/rules.rs", source), []);
  });

  it("paths 를 주지 않으면 files 의 경로로 모듈을 정한다", () => {
    const found = internalUseViolations([
      { path: "account/mod.rs", source: "mod api;\n" },
      { path: "account/api.rs", source: "" },
      { path: "app.rs", source: "use crate::account::api::router;\n" },
    ]);
    assert.deepEqual(
      found.map((v) => v.file),
      ["app.rs"],
    );
  });

  it("app 은 기능이 아니다: app.rs 곁의 app/ 내부 경로는 기능 밖에서 써도 된다", () => {
    const paths = ["main.rs", "app.rs", "app/routes.rs", "shared/mod.rs", "shared/config.rs"];
    const found = internalUseViolations(
      [{ path: "main.rs", source: "use crate::app::routes::router;\nuse crate::shared::config::Config;\n" }],
      paths,
    );
    assert.deepEqual(
      found.map((v) => ({ line: v.line, owner: v.owner })),
      [{ line: 2, owner: "shared" }],
    );
  });

  it("mod.rs 가 없는 디렉터리(x.rs 곁의 x/)는 기능이 아니므로 그 아래 경로는 걸지 않는다", () => {
    const paths = ["main.rs", "util.rs", "util/text.rs"];
    assert.deepEqual(internalUseViolations([{ path: "main.rs", source: "use crate::util::text::trim;\n" }], paths), []);
  });
});

describe("featureDirs", () => {
  it("맨 위의 mod.rs 디렉터리와 기능 아래의 하위 기능만 고른다", () => {
    const dirs = featureDirs([
      "main.rs",
      "app/mod.rs",
      "identity/mod.rs",
      "identity/auth/mod.rs",
      "identity/auth/cookies.rs",
      "util.rs",
      "util/text/mod.rs",
      "a/mod.rs",
      "a/b/mod.rs",
      "a/b/c/mod.rs",
    ]);
    assert.deepEqual([...dirs].sort(), ["a", "a/b", "identity", "identity/auth"]);
  });
});
