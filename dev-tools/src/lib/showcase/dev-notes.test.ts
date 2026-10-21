import assert from "node:assert/strict";
import { test } from "node:test";

import {
  devNotesFindings,
  findingLines,
  isCalendarDate,
  type Json,
  type JsonObject,
  parseDevNotes,
} from "./dev-notes.ts";

const good = {
  date: "2026-01-15",
  kind: "feature",
  title: "새 화면에서 지난 이야기를 다시 볼 수 있어요",
  body: "끝난 대화를 눌러 그날 나눈 말을 다시 읽을 수 있어요.",
  issue: 7,
};

function rulesOf(entry: JsonObject): string[] {
  return devNotesFindings({ entries: [entry] }).map((f) => f.rule);
}

test("모양이 맞고 글이 깨끗하면 발견이 없다", () => {
  assert.deepEqual(devNotesFindings({ note: "메모", entries: [good, { ...good, kind: "planned" }] }), []);
  assert.deepEqual(devNotesFindings({ entries: [] }), []);
});

test("최상위에 entries 배열이 없으면 걸린다", () => {
  const shapes: Json[] = [null, [], {}, { entries: {} }, "x"];
  for (const json of shapes) {
    assert.deepEqual(
      devNotesFindings(json).map((f) => f.rule),
      ["shape"],
    );
  }
  assert.deepEqual(rulesOfList([1]), ["shape"]);
});

function rulesOfList(entries: Json[]): string[] {
  return devNotesFindings({ entries }).map((f) => f.rule);
}

test("JSON 이 아니면 걸린다", () => {
  assert.deepEqual(
    parseDevNotes("{").map((f) => f.rule),
    ["json"],
  );
  assert.deepEqual(parseDevNotes(JSON.stringify({ entries: [good] })), []);
});

test("날짜는 YYYY-MM-DD 이고 달력에 있어야 한다", () => {
  assert.ok(isCalendarDate("2024-02-29"));
  for (const bad of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-5", "2026/01/05", "20260105", ""]) {
    assert.equal(isCalendarDate(bad), false, bad);
  }
  assert.deepEqual(rulesOf({ ...good, date: "2026-02-30" }), ["date"]);
  assert.deepEqual(rulesOf({ ...good, date: 20260115 }), ["date"]);
});

test("종류는 넷 중 하나여야 한다", () => {
  for (const kind of ["bug", "feature", "improvement", "planned"]) {
    assert.deepEqual(rulesOf({ ...good, kind }), []);
  }
  assert.deepEqual(rulesOf({ ...good, kind: "fix" }), ["kind"]);
  const { kind: _kind, ...withoutKind } = good;
  assert.deepEqual(rulesOf(withoutKind), ["kind"]);
});

test("issue 는 양의 정수여야 한다", () => {
  for (const issue of [0, -1, 1.5, "7", null]) {
    assert.deepEqual(rulesOf({ ...good, issue }), ["issue"], String(issue));
  }
});

test("제목과 설명은 비지 않은 문자열이어야 한다", () => {
  assert.deepEqual(rulesOf({ ...good, title: "" }), ["text"]);
  assert.deepEqual(rulesOf({ ...good, body: "   " }), ["text"]);
  assert.deepEqual(rulesOf({ ...good, body: 3 }), ["text"]);
});

test("ADR-0003 의 금지어가 제목과 설명에 있으면 걸린다", () => {
  assert.deepEqual(rulesOf({ ...good, title: "상담사가 답해요" }), ["bannedWord"]);
  assert.deepEqual(rulesOf({ ...good, body: "치료처럼 느껴지지 않게 했어요." }), ["bannedWord"]);
  for (const word of ["counseling", "Therapist", "treatment", "clinical", "diagnosed", "cure", "patients"]) {
    assert.deepEqual(rulesOf({ ...good, body: `Now with ${word} notes.` }), ["bannedWord"], word);
  }
  // 낱말의 일부일 뿐인 영어는 걸리지 않는다.
  assert.deepEqual(rulesOf({ ...good, body: "A secure page." }), []);
});

test("바깥 기관 이름 자살예방상담전화는 금지어에서 뺀다", () => {
  assert.deepEqual(rulesOf({ ...good, body: "자살예방상담전화 번호는 그대로예요." }), []);
  assert.deepEqual(rulesOf({ ...good, body: "자살예방상담전화와 상담 안내" }), ["bannedWord"]);
});

test("코드 이름(백틱, 대문자 환경 변수 꼴, #숫자, github.com)이 있으면 걸린다", () => {
  assert.deepEqual(rulesOf({ ...good, body: "`reply` 를 고쳤어요." }), ["backtick"]);
  assert.deepEqual(rulesOf({ ...good, body: "SESSION_TTL 을 늘렸어요." }), ["envName"]);
  assert.deepEqual(rulesOf({ ...good, title: "API 를 바꿨어요" }), ["envName"]);
  assert.deepEqual(rulesOf({ ...good, body: "#18 에서 고쳤어요." }), ["issueNumber"]);
  assert.deepEqual(rulesOf({ ...good, body: "자세한 건 https://github.com/x/y 에서요." }), ["githubLink"]);
  // 두 글자 대문자와 섞인 대소문자는 걸리지 않는다.
  assert.deepEqual(rulesOf({ ...good, body: "QA 와 WebP 사진, Ok." }), []);
});

test("발견 한 줄에 항목 자리와 규칙이 보인다", () => {
  const lines = findingLines(devNotesFindings({ entries: [good, { ...good, kind: "fix" }] }));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^entries\[1\] kind: /);
  assert.match(findingLines(devNotesFindings({}))[0]!, /^\(최상위\) shape: /);
});
