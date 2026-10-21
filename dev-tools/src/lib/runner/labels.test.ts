import assert from "node:assert/strict";
import { test } from "node:test";

import { KNOWN_LABELS, planLabels, splitLabels } from "./labels.ts";

test("splitLabels 는 쉼표로 나누고 빈 칸과 겹침을 뺀다", () => {
  assert.deepEqual(splitLabels("review:ready, run:implement,,review:ready "), ["review:ready", "run:implement"]);
  assert.deepEqual(splitLabels(undefined), []);
  assert.deepEqual(splitLabels(""), []);
});

test("planLabels 는 레포에 없는 붙일 라벨을 먼저 만들고, 레포에 있는 것만 뗀다", () => {
  const plan = planLabels(["run:implement", "bug"], ["review:ready", "bug", "새것"], ["run:implement", "run:again"]);
  assert.deepEqual(plan, {
    create: [
      { name: "review:ready", ...KNOWN_LABELS["review:ready"]! },
      { name: "새것", color: "ededed", description: "" },
    ],
    add: ["review:ready", "bug", "새것"],
    remove: ["run:implement"],
  });
});

test("planLabels 는 같은 라벨을 붙이고 떼라고 하면 거절한다", () => {
  assert.throws(() => planLabels([], ["run:blocked"], ["run:blocked"]), /같은 라벨/);
});

test("러너가 쓰는 네 라벨은 모두 색과 설명이 있다", () => {
  for (const name of ["run:implement", "run:again", "run:blocked", "review:ready"]) {
    assert.ok(KNOWN_LABELS[name], name);
    assert.match(KNOWN_LABELS[name]!.color, /^[0-9a-f]{6}$/);
  }
});
