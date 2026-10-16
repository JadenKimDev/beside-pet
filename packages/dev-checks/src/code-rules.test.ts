// 레포 검사 규칙의 입구가 패키지 경로로 열리는지 본다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as rules from "@beside-pet/dev-checks/code-rules";

describe("code-rules 입구", () => {
  it("세 규칙과 소스 글 다루기의 함수를 내보낸다", () => {
    const kinds = new Map(Object.entries(rules).map(([name, value]) => [name, typeof value]));
    for (const name of [
      "largeFiles",
      "isTestPath",
      "duplicateBodies",
      "functionBodies",
      "genericTypeViolations",
      "blankCommentsAndStrings",
      "languageOf",
    ]) {
      assert.equal(kinds.get(name), "function", name);
    }
  });
});
