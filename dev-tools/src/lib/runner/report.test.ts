import assert from "node:assert/strict";
import { test } from "node:test";

import type { Outcome } from "../ledger.ts";
import {
  buildComment,
  COMMENT_MARKER,
  findOutcome,
  parseQaReport,
  qaTable,
  summarizeTestLog,
  type TaskRow,
  taskTable,
} from "./report.ts";

const rows: TaskRow[] = [
  { id: "S1", title: "보고 작성기", status: "done", retries: 0, active_ms: 125_000, verify_ms: 2_000 },
  { id: "S2", title: "러너 | 스크립트\n둘째 줄", status: "parked", retries: 5, active_ms: null, verify_ms: null },
];

function outcomeLine(issue: number, title: string): string {
  const record: Outcome = {
    issue,
    title,
    finished_at: "2026-10-21T00:00:00.000Z",
    lead_time_ms: 1,
    active_ms: 1,
    tasks: [{ id: "S1", title: "t", scope: [], status: "done", retries: 0, active_ms: 1, verify_ms: 1 }],
  };
  return JSON.stringify(record);
}

test("findOutcome 은 그 이슈의 마지막 줄을 고르고 깨진 줄과 빈 줄은 건너뛴다", () => {
  const jsonl = [outcomeLine(7, "처음"), "{깨짐", "", outcomeLine(8, "다른 이슈"), outcomeLine(7, "다시 마감")].join(
    "\n",
  );
  assert.equal(findOutcome(jsonl, 7)?.title, "다시 마감");
  assert.equal(findOutcome(jsonl, 8)?.title, "다른 이슈");
  assert.equal(findOutcome(jsonl, 9), null);
  assert.equal(findOutcome("", 7), null);
});

test("taskTable 은 작업마다 판정과 시간을 한 줄로, 칸 안의 | 와 줄바꿈은 지운다", () => {
  const table = taskTable(rows).split("\n");
  assert.equal(table.length, 4);
  assert.match(table[2]!, /^\| S1 \| 보고 작성기 \| ✓ done \| .+ \| .+ \| 0 \|$/);
  assert.ok(table[3]!.includes("러너 \\| 스크립트 둘째 줄"));
  assert.ok(table[3]!.includes("✗ parked"));
  assert.ok(table[3]!.includes("| — | — | 5 |"));
  assert.equal(taskTable([]), "_작업이 없습니다._");
});

test("summarizeTestLog 는 종료 코드가 있으면 그것으로 판정한다", () => {
  const log = "# pass 10\n# fail 0\n";
  assert.equal(summarizeTestLog(log, { exitCode: 1 }).passed, false);
  assert.equal(summarizeTestLog("ELIFECYCLE", { exitCode: 0 }).passed, true);
});

test("summarizeTestLog 는 종료 코드가 없으면 로그 낱말로 가늠하고 node:test 와 cargo 의 수를 더한다", () => {
  const ok = [
    "# tests 12",
    "# pass 12",
    "# fail 0",
    "test result: ok. 30 passed; 0 failed; 1 ignored; 0 measured",
    "",
    "",
  ].join("\n");
  assert.deepEqual(summarizeTestLog(ok), {
    passed: true,
    pass: 42,
    fail: 0,
    tail: ["# tests 12", "# pass 12", "# fail 0", "test result: ok. 30 passed; 0 failed; 1 ignored; 0 measured"],
  });

  const bad = "# pass 3\n# fail 2\n ELIFECYCLE  Command failed with exit code 1.";
  const summary = summarizeTestLog(bad);
  assert.equal(summary.passed, false);
  assert.equal(summary.fail, 2);

  const spec = "dev-tools test: ℹ pass 14\ndev-tools test: ℹ fail 0\nweb test: ℹ pass 6\nweb test: ℹ fail 1";
  assert.deepEqual(
    [summarizeTestLog(spec).pass, summarizeTestLog(spec).fail, summarizeTestLog(spec).passed],
    [20, 1, false],
  );

  assert.equal(summarizeTestLog("test result: FAILED. 1 passed; 1 failed;").passed, false);
  assert.deepEqual(summarizeTestLog("그냥 글"), { passed: null, pass: null, fail: null, tail: ["그냥 글"] });
});

test("summarizeTestLog 는 꼬리를 N 줄로 자르고 색 제어 문자를 지운다", () => {
  const esc = String.fromCharCode(27);
  const log = Array.from({ length: 50 }, (_, i) => `${esc}[32mline ${i}${esc}[0m`).join("\n");
  const summary = summarizeTestLog(log, { tailLines: 3 });
  assert.deepEqual(summary.tail, ["line 47", "line 48", "line 49"]);
});

// 지어낸 보고서. 두 가지 모양을 섞었다: 결과 낱말이 그냥 글인 것과 <span> 안인 것.
const QA_HTML = `<!doctype html><html><body>
<h1>#99 실측 확인: 지어낸 기능 &amp; 화면</h1>
<h2>결과: 통과 2 / 실패 1 / 확인 불가 1</h2>
<section><h3>준비</h3><p>계정 없음.</p></section>
<section><h3>1. 첫 화면을 연다. 실패하지 않으면 통과.</h3>
<p><b>한 일</b> 열었다.</p>
<img src="01-top.jpg"><img class="n" src='02-side.png'>
<p><b>사유</b> 기대한 대로 보였다. 처음엔 실패했다.</p>
<p><b>결과</b> 통과</p></section>
<section><h3>2. 목록을 연다 &lt;390px&gt;</h3>
<p><b>결과</b> <span class="p">실패</span> (넘침 12px)</p></section>
<section><h3>3. 메일을 받는다</h3>
<img src="03-mail.png">
<p><b>결과</b> <span class="w">확인 불가</span></p></section>
<h3>4. 섹션 없는 항목</h3><p>결과 통과</p>
<h2>눈에 띈 것</h2><ul><li>덤 <img src="99-extra.jpg"></li></ul>
</body></html>`;

test("parseQaReport 는 h3 하나를 항목 하나로, 결과 뒤 첫 판정 낱말과 img src 를 뽑는다", () => {
  const report = parseQaReport(QA_HTML);
  assert.equal(report.title, "#99 실측 확인: 지어낸 기능 & 화면");
  assert.deepEqual(report.items, [
    { title: "1. 첫 화면을 연다. 실패하지 않으면 통과.", verdict: "통과", images: ["01-top.jpg", "02-side.png"] },
    { title: "2. 목록을 연다 <390px>", verdict: "실패", images: [] },
    { title: "3. 메일을 받는다", verdict: "확인 불가", images: ["03-mail.png"] },
    { title: "4. 섹션 없는 항목", verdict: "통과", images: [] },
  ]);
});

test("parseQaReport 는 판정이 없는 글에서 빈 목록을 돌려준다", () => {
  assert.deepEqual(parseQaReport("<html><body><p>아무것도</p></body></html>"), { title: null, items: [] });
});

test("qaTable 은 합계와 항목 표를 쓰고, imageBase 를 이미지 경로 앞에 붙인다", () => {
  const table = qaTable(parseQaReport(QA_HTML), { imageBase: "/runner/outputs/qa/99/" });
  const lines = table.split("\n");
  assert.equal(lines[0], "통과 2 / 실패 1 / 확인 불가 1");
  assert.ok(lines[4]!.includes("`/runner/outputs/qa/99/01-top.jpg`<br>`/runner/outputs/qa/99/02-side.png`"));
  assert.ok(lines[5]!.includes("| 실패 | - |"));
  assert.equal(qaTable({ title: null, items: [] }), "_보고서에서 판정이 적힌 항목을 찾지 못했습니다._");
});

test("buildComment 는 표식, 커밋, 작업 표, 테스트 요약, QA 표를 한 댓글로 엮는다", () => {
  const comment = buildComment({
    issue: 99,
    sha: "abc1234",
    tasks: { source: "outcome", rows },
    test: summarizeTestLog("# pass 4\n# fail 0\n", { exitCode: 0 }),
    qa: { report: parseQaReport(QA_HTML) },
  });
  assert.ok(comment.startsWith(`${COMMENT_MARKER}\n## 러너 결과 #99`));
  assert.ok(comment.includes("커밋 `abc1234`"));
  assert.ok(comment.includes("마감한 실측"));
  assert.ok(comment.includes("| S1 | 보고 작성기 |"));
  assert.ok(comment.includes("**✓ 통과** — 통과 4, 실패 0"));
  assert.ok(comment.includes("통과 2 / 실패 1 / 확인 불가 1"));
  assert.ok(comment.includes("`01-top.jpg`"));
});

test("buildComment 는 빠진 입력마다 그렇다고 적고, 로그 안의 ``` 가 코드 블록을 닫지 않게 한다", () => {
  const comment = buildComment({
    issue: 5,
    sha: "def",
    tasks: null,
    test: summarizeTestLog("```\n깨진 울타리"),
    qa: null,
  });
  assert.ok(comment.includes("_원장 실측이 없습니다._"));
  assert.ok(comment.includes("_QA 보고서가 없습니다._"));
  assert.ok(comment.includes("**판정 모름**"));
  assert.ok(comment.includes("````\n```\n깨진 울타리\n````"));
  assert.ok(
    buildComment({ issue: 5, sha: "d", tasks: null, test: null, qa: null }).includes(
      "_테스트 로그를 받지 않았습니다._",
    ),
  );
  assert.ok(
    buildComment({ issue: 5, sha: "d", tasks: { source: "ledger", rows: [] }, test: null, qa: null }).includes(
      "진행 중인 원장",
    ),
  );
});
