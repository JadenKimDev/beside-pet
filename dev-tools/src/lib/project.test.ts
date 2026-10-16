import assert from "node:assert/strict";
import { test } from "node:test";

import { pickOption } from "./project.ts";

const options = [
  { id: "a", name: "Backlog" },
  { id: "b", name: "Ready" },
  { id: "c", name: "In progress" },
  { id: "d", name: "Done" },
];

test("보드의 선택지에서 상태에 해당하는 것을 고른다", () => {
  assert.equal(pickOption(options, "backlog")?.id, "a");
  assert.equal(pickOption(options, "in_progress")?.id, "c");
});

test("이름이 조금 달라도 찾고, 없으면 고르지 않는다", () => {
  const todo = [
    { id: "x", name: "Todo" },
    { id: "y", name: "In Progress " },
  ];
  assert.equal(pickOption(todo, "backlog")?.id, "x");
  assert.equal(pickOption(todo, "in_progress")?.id, "y");
  assert.equal(pickOption([{ id: "z", name: "Done" }], "backlog"), undefined);
});
