// `mod.rs` 자리 규칙의 단위 테스트. 경로는 서버 크레이트의 `src` 기준이다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modPlacementViolations } from "./mod-placement.ts";

function paths(found: { path: string }[]) {
  return found.map((v) => v.path);
}

describe("modPlacementViolations", () => {
  it("기능과 하위 기능의 mod.rs, x.rs 곁의 x/ 는 허용한다", () => {
    const ok = [
      "main.rs",
      "app.rs",
      "conversation/mod.rs",
      "conversation/chat.rs",
      "conversation/chat/tests.rs",
      "conversation/chat/tests/first.rs",
      "introduction/mod.rs",
      "introduction/affinity/mod.rs",
      "introduction/affinity/judge.rs",
      "introduction/affinity/judge/weights.rs",
    ];
    assert.deepEqual(modPlacementViolations(ok), []);
  });

  it("하위 기능보다 깊은 mod.rs 는 어김이다", () => {
    const found = modPlacementViolations(["a/mod.rs", "a/b/mod.rs", "a/b/c/mod.rs"]);
    assert.deepEqual(paths(found), ["a/b/c/mod.rs"]);
    assert.ok(found[0]!.rule.length > 0);
  });

  it("src 바로 아래의 mod.rs 는 어김이다", () => {
    assert.deepEqual(paths(modPlacementViolations(["mod.rs", "main.rs"])), ["mod.rs"]);
  });

  it("mod.rs 도 x.rs 도 없는 디렉터리는 어김이다", () => {
    const found = modPlacementViolations(["a/mod.rs", "a/b.rs", "a/c/d.rs", "a/b/e.rs"]);
    assert.deepEqual(paths(found), ["a/c"]);
  });

  it("깊은 디렉터리도 곁의 x.rs 를 본다", () => {
    const found = modPlacementViolations(["a/mod.rs", "a/b/mod.rs", "a/b/c.rs", "a/b/c/d.rs", "a/b/c/e/f.rs"]);
    assert.deepEqual(paths(found), ["a/b/c/e"]);
  });

  it("tests/ 디렉터리는 tests.rs 없이도, tests/mod.rs 로도 허용한다", () => {
    const ok = [
      "a/mod.rs",
      "a/x.rs",
      "a/x/tests/mod.rs",
      "a/x/tests/one.rs",
      "a/y.rs",
      "a/y/tests/two.rs",
      "a/y/tests/fixtures/f.rs",
    ];
    assert.deepEqual(modPlacementViolations(ok), []);
  });

  it("app 은 기능이 아니므로 app/mod.rs 는 어김이고 app.rs 곁의 app/ 는 허용한다", () => {
    assert.deepEqual(modPlacementViolations(["main.rs", "app.rs", "app/routes.rs"]), []);
    const found = modPlacementViolations(["main.rs", "app/mod.rs", "app/routes.rs"]);
    assert.deepEqual(paths(found), ["app/mod.rs"]);
    assert.match(found[0]!.rule, /app\.rs 로 옮긴다/);
  });

  it("기능이 아닌 모듈(x.rs) 아래의 x/<이름>/mod.rs 는 어김이다", () => {
    const found = modPlacementViolations(["shared.rs", "shared/db/mod.rs", "shared/db/pool.rs"]);
    assert.deepEqual(paths(found), ["shared/db/mod.rs"]);
  });

  it("rs 가 아닌 파일은 보지 않는다", () => {
    assert.deepEqual(modPlacementViolations(["a/mod.rs", "a/data/x.json"]), []);
  });
});
