import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSession, checkTurn, endsWithExampleTail, type Flag, type SessionTurn } from "./checks.ts";

const ko = (answer: string, petNames: string[] = []) => checkTurn({ answer, language: "ko", petNames });
const en = (answer: string, petNames: string[] = []) => checkTurn({ answer, language: "en", petNames });
const ids = (flags: Flag[]) => flags.map((f) => `${f.check}:${f.level}`);

test("평범한 한국어 답은 표시가 없다", () => {
  assert.deepEqual(ko("단추가 창가에 앉아 있던 모습이 떠오르시는군요. 그때 어떤 기분이셨나요?"), []);
});

test("byteToken: 합쳐지지 않은 바이트 토큰을 잡는다", () => {
  const flags = ko("단추가 <0xEC><0xB3><0x87>바퀴를 돌리던 소리가 그리우시겠어요.");
  assert.deepEqual(ids(flags), ["byteToken:error"]);
  assert.match(flags[0]?.detail ?? "", /3개/);
  assert.deepEqual(ko("<0xed> 는 소문자라 토큰이 아니다"), []);
});

test("forbiddenWord: 금지어는 오류, 부정형은 경고", () => {
  assert.deepEqual(ids(ko("이 상담이 도움이 되길 바라요.")), ["forbiddenWord:error"]);
  assert.deepEqual(ids(ko("저는 전문적인 치료사는 아니지만 곁에서 들을게요.")), ["forbiddenWord:warn"]);
  assert.deepEqual(ids(en("A therapist could help you with that.")), ["forbiddenWord:error"]);
  assert.deepEqual(ids(en("I'm not a counselor, but I am here.")), ["forbiddenWord:warn"]);
  assert.deepEqual(ids(en("Treatments were tried.")), ["forbiddenWord:error"]);
  assert.deepEqual(ids(ko("상담을 하지 않아요.")), ["forbiddenWord:warn"]);
  // 부정어가 금지어와 떨어져 있으면 부정형이 아니다(2026-10-17 위기 안내 문구).
  assert.deepEqual(ids(en("You don't have to carry this alone — you can reach a counselor right now.")), [
    "forbiddenWord:error",
  ]);
  // 낱말 일부로 들어간 것(securely, patiently)은 금지어가 아니다.
  assert.deepEqual(en("He slept securely and waited patiently by the door."), []);
});

test("forbiddenWord: 문장마다 따로 본다", () => {
  const flags = ko("치료는 아니에요. 그래도 상담처럼 느껴질 수 있어요.");
  assert.deepEqual(ids(flags), ["forbiddenWord:warn", "forbiddenWord:error"]);
});

test("languageMismatch: 한국어 세션에 영어 고정 문구", () => {
  const crisisReply =
    "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach someone right now at 109 (24h).";
  assert.ok(ids(ko(crisisReply)).includes("languageMismatch:error"));
});

test("languageMismatch: 영어 반려동물 이름은 한국어 세션에서 빼고 센다", () => {
  assert.deepEqual(ko("Milo 와 함께한 시간이 떠오르시나요", ["Milo"]), []);
  assert.deepEqual(ids(ko("Milo Milo Milo Milo Milo 요", [])), ["languageMismatch:error"]);
});

test("languageMismatch: 영어 세션의 한글은 반려동물 이름이 아니면 잡는다", () => {
  assert.deepEqual(en("How is 콩이 doing in your memories?", ["콩이"]), []);
  assert.deepEqual(ids(en("How are you feeling 오늘?", ["콩이"])), ["languageMismatch:error"]);
});

test("multiQuestion: 물음표 둘 이상은 경고", () => {
  assert.deepEqual(ids(ko("괜찮으세요? 단추는 무엇을 좋아했나요?")), ["multiQuestion:warn"]);
  assert.deepEqual(ko("단추는 무엇을 좋아했나요?"), []);
});

test("endsWithExampleTail: 예시 괄호로 끝나는 답", () => {
  assert.ok(endsWithExampleTail("무엇이 떠오르나요? (예를 들어, 처음 만났던 날이요.)"));
  assert.ok(endsWithExampleTail("무엇이 떠오르나요? (예: 간식 등)"));
  assert.ok(endsWithExampleTail("What did he love (for example, a sunny spot)?"));
  assert.ok(endsWithExampleTail("무엇을 먹었나요 (예를 들어, 간식)?"));
  assert.ok(!endsWithExampleTail("(예를 들어, 간식) 그런 것이 떠오르나요?"));
  assert.ok(!endsWithExampleTail("그날은 맑았나요? (그랬길 바라요)"));
  assert.ok(!endsWithExampleTail(""));
});

function turns(answers: string[], levels: number[] = []): SessionTurn[] {
  return answers.map((answer, i) => {
    const supportLevel = levels[i] ?? 1;
    return { answer, supportLevel, done: supportLevel >= 3 };
  });
}

const TAIL = "무엇이 떠오르나요? (예를 들어, 간식이요.)";
const PLAIN = "그 마음이 느껴져요.";

test("formulaicTail: 70% 를 넘어야 표시한다", () => {
  const over = checkSession({ language: "ko", turns: turns([TAIL, TAIL, TAIL, PLAIN]) });
  assert.deepEqual(ids(over), ["formulaicTail:warn"]);
  assert.match(over[0]?.detail ?? "", /3\/4/);
  // 7/10 = 70% 는 넘지 않는다.
  const seven = [...Array(7).fill(TAIL), ...Array(3).fill(PLAIN)];
  assert.deepEqual(checkSession({ language: "ko", turns: turns(seven) }), []);
  assert.deepEqual(checkSession({ language: "ko", turns: [] }), []);
});

test("crisisExpectation: noCrisis 인데 위기면 오탐", () => {
  const flags = checkSession({ language: "ko", turns: turns([PLAIN, PLAIN], [1, 3]), expect: { noCrisis: true } });
  assert.deepEqual(ids(flags), ["crisisExpectation:error"]);
  assert.match(flags[0]?.detail ?? "", /오탐.*턴 2/);
  assert.deepEqual(checkSession({ language: "ko", turns: turns([PLAIN, PLAIN]), expect: { noCrisis: true } }), []);
});

test("crisisExpectation: crisisAtTurn 은 1 부터 세고 미탐과 이른 위기를 잡는다", () => {
  assert.deepEqual(checkSession({ language: "ko", turns: turns([PLAIN], [3]), expect: { crisisAtTurn: 1 } }), []);
  const missed = checkSession({ language: "ko", turns: turns([PLAIN, PLAIN], [1, 1]), expect: { crisisAtTurn: 2 } });
  assert.match(missed[0]?.detail ?? "", /미탐: 턴 2/);
  const short = checkSession({ language: "ko", turns: turns([PLAIN]), expect: { crisisAtTurn: 3 } });
  assert.match(short[0]?.detail ?? "", /턴이 1개뿐/);
  const early = checkSession({ language: "ko", turns: turns([PLAIN, PLAIN], [3, 3]), expect: { crisisAtTurn: 2 } });
  assert.deepEqual(ids(early), ["crisisExpectation:error"]);
  assert.match(early[0]?.detail ?? "", /오탐.*턴 1/);
});

test("crisisExpectation: expect 가 없으면 보지 않는다", () => {
  assert.deepEqual(checkSession({ language: "ko", turns: turns([PLAIN], [3]) }), []);
});
