import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CODE_ROOTS, DEFAULT_TDD_AREAS, parseConfig } from "./config.ts";

test("빈 칸은 기본값으로 채운다", () => {
  const config = parseConfig(JSON.stringify({ name: "acme-shop" }));
  assert.deepEqual(config, {
    name: "acme-shop",
    repo: null,
    ghUser: null,
    boardNumber: null,
    tddAreas: [...DEFAULT_TDD_AREAS],
    codeRoots: [...DEFAULT_CODE_ROOTS],
  });
});

test("적힌 값은 그대로 읽는다", () => {
  const config = parseConfig(
    JSON.stringify({
      name: "acme-shop",
      repo: "acme/shop",
      ghUser: "someone",
      boardNumber: 3,
      tddAreas: ["apps/api", "apps/web"],
      codeRoots: ["apps/api/src/"],
    }),
  );
  assert.equal(config.repo, "acme/shop");
  assert.equal(config.ghUser, "someone");
  assert.equal(config.boardNumber, 3);
  assert.deepEqual(config.tddAreas, ["apps/api", "apps/web"]);
  assert.deepEqual(config.codeRoots, ["apps/api/src/"]);
});

test("모양이 틀리면 어느 칸인지 말한다", () => {
  assert.throws(() => parseConfig("[]"), /객체가 아닙니다/);
  assert.throws(() => parseConfig(JSON.stringify({})), /name 이 없습니다/);
  assert.throws(() => parseConfig(JSON.stringify({ name: "a", repo: "no-slash" })), /owner\/name/);
  assert.throws(() => parseConfig(JSON.stringify({ name: "a", boardNumber: 0 })), /boardNumber/);
  assert.throws(() => parseConfig(JSON.stringify({ name: "a", boardNumber: "1" })), /boardNumber/);
  assert.throws(() => parseConfig(JSON.stringify({ name: "a", tddAreas: ["", "x"] })), /tddAreas/);
  assert.throws(() => parseConfig(JSON.stringify({ name: "a", ghUser: 5 })), /ghUser/);
});
