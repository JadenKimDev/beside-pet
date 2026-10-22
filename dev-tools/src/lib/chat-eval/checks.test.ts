import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkElapsed,
  checkSession,
  checkTurn,
  echoedOpening,
  elapsedMentions,
  endsWithExampleTail,
  type Flag,
  genericRate,
  reassureRate,
  type SessionTurn,
} from "./checks.ts";

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
// 상투구 사전에 없는 문장이라 같은 답이 되풀이돼도 stockRepeat 이 나지 않는다.
const PLAIN = "단추가 좋아하던 자리가 떠오르네요.";

test("formulaicTail: 70% 를 넘어야 표시한다", () => {
  const over = checkSession({ language: "ko", turns: turns([TAIL, TAIL, TAIL, PLAIN]) });
  // 같은 예시 괄호가 되풀이되므로 턴 2, 3 은 이미 쓴 상투구 "(예를" 의 반복이기도 하다.
  assert.deepEqual(ids(over), ["formulaicTail:warn", "stockRepeat:warn", "stockRepeat:warn"]);
  assert.match(over[0]?.detail ?? "", /3\/4/);
  // 7/10 = 70% 는 넘지 않는다.
  const seven = [...Array(7).fill(TAIL), ...Array(3).fill(PLAIN)];
  assert.deepEqual(ids(checkSession({ language: "ko", turns: turns(seven) })), Array(6).fill("stockRepeat:warn"));
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

/** 사용자 말과 답의 짝으로 만든 턴. 위기는 없다. */
function talk(pairs: [string, string][]): SessionTurn[] {
  return pairs.map(([user, answer]) => ({ user, answer, supportLevel: 1, done: false }));
}

test("stockRepeat: 앞 답에 나온 상투구가 다시 나오면 그 턴을 표시한다", () => {
  const flags = checkSession({
    language: "ko",
    turns: talk([
      ["단추가 보고 싶어요", "천천히 이야기해 주세요."],
      ["산책하던 길이 생각나요", "그 길을 걷던 단추가 떠오르네요."],
      ["매일 저녁이었어요", "천천히 떠올려 봐요. 여기 있어요."],
    ]),
  });
  assert.deepEqual(ids(flags), ["stockRepeat:warn"]);
  assert.match(flags[0]?.detail ?? "", /턴 3: 천천히$/);
});

test("stockRepeat: 처음 쓴 상투구, 사용자가 직접 쓴 낱말은 표시하지 않는다", () => {
  const fresh = talk([
    ["단추가 보고 싶어요", "천천히 이야기해 주세요."],
    ["꼬리치던 모습이 생각나요", "꼬리를 흔들며 반기던 모습이 떠오르네요."],
    ["문 앞에서 늘 그랬어요", "꼬리가 문에 부딪히던 소리도 기억나시겠어요."],
  ]);
  assert.deepEqual(checkSession({ language: "ko", turns: fresh }), []);
});

test("stockRepeat: 사용자 말이 없는 입력에서는 답만으로 본다", () => {
  const flags = checkSession({ language: "ko", turns: turns(["코끝이 찡하네요.", "코끝에 닿던 숨결이요."]) });
  assert.deepEqual(ids(flags), ["stockRepeat:warn"]);
});

test("echoedOpening: 첫 문장이 사용자 말의 어절 둘을 이어서 쓰면 되받기다", () => {
  assert.equal(
    echoedOpening("산책하던 길이 생각나시는군요. 어떤 길이었나요?", "요즘 산책하던 길이 자꾸 생각나요"),
    "산책하던 길이",
  );
  // 공백 없이 그대로 되풀이한 시작(실측 하네스의 앞 여섯 글자 규칙).
  assert.equal(echoedOpening("밥을안먹어요라고하셨죠.", "단추가 밥을안먹어요"), "밥을안먹어요");
  // 두 번째 문장의 겹침은 시작이 아니다.
  assert.equal(echoedOpening("그 시간이 소중했겠어요. 산책하던 길이 어땠나요?", "산책하던 길이 생각나요"), null);
  // 어절 하나만 같으면 되받기가 아니다.
  assert.equal(echoedOpening("단추와 함께한 날들이 떠오르네요.", "단추가 보고 싶어요"), null);
});

test("echoOpening: 사용자 말을 되받으며 시작한 턴을 표시하고, 사용자 말이 없으면 보지 않는다", () => {
  const flags = checkSession({
    language: "ko",
    turns: talk([
      ["요즘 산책하던 길이 자꾸 생각나요", "산책하던 길이 자꾸 생각나시는군요."],
      ["저녁마다 같이 걸었어요", "그 시간이 하루의 쉼이었겠어요."],
    ]),
  });
  assert.deepEqual(ids(flags), ["echoOpening:warn"]);
  assert.match(flags[0]?.detail ?? "", /^턴 1: /);
  assert.deepEqual(checkSession({ language: "ko", turns: turns(["산책하던 길이 생각나시는군요."]) }), []);
});

test("reassureRate: 정상화 위로가 들어간 답의 비율", () => {
  assert.equal(
    reassureRate(["그렇게 느끼는 건 자연스러운 일이에요.", "단추와 걷던 길이요.", "It's normal to miss her.", ""]),
    2 / 3,
  );
  assert.equal(reassureRate(["단추와 걷던 길이요.", "어떤 날이었나요?"]), 0);
  assert.equal(reassureRate([]), null);
  // 표시는 내지 않는다.
  assert.deepEqual(
    checkSession({ language: "ko", turns: turns(["당연히 그리우시죠.", "그만큼 아끼셨으니까요."]) }),
    [],
  );
});

test("genericRate: 라벨이 있는 턴 가운데 generic_comfort 의 비율, 라벨 없는 턴은 분모에서 뺀다", () => {
  assert.equal(genericRate(["generic_comfort", "specific_reflection", undefined, "question", "generic_comfort"]), 0.5);
  assert.equal(genericRate(["specific_reflection", "question"]), 0);
  assert.equal(genericRate(["generic_comfort"]), 1);
});

test("genericRate: 라벨이 하나도 없거나 턴이 없으면 null", () => {
  assert.equal(genericRate([undefined, undefined]), null);
  assert.equal(genericRate([]), null);
});

const days = (answer: string) => elapsedMentions(answer).map((m) => m.days);

test("elapsedMentions: 일·주·달·해 단위의 수를 날로 바꾼다", () => {
  assert.deepEqual(days("3일 만이에요"), [3]);
  assert.deepEqual(days("일주일 만이네요"), [7]);
  assert.deepEqual(days("2주가 지났어요"), [14]);
  assert.deepEqual(days("석 달 만이에요"), [90]);
  // 숫자 말을 먼저, 수사 말을 뒤에 센다.
  assert.deepEqual(days("두 달, 그리고 3개월"), [90, 60]);
  assert.deepEqual(days("이틀 전"), [2]);
  assert.deepEqual(days("보름쯤"), [15]);
  assert.deepEqual(days("It has been three weeks."), [21]);
  assert.deepEqual(days("about 2 months"), [60]);
  assert.deepEqual(days("a month ago"), [30]);
});

test("elapsedMentions: 수가 없거나 날짜·연도·관용구면 세지 않는다", () => {
  assert.deepEqual(days("오랜만이에요. 몇 달이 흘렀네요."), []);
  assert.deepEqual(days("10월 3일에 보냈다고 하셨죠"), []);
  assert.deepEqual(days("2026년 봄"), []);
  assert.deepEqual(days("하루하루가 길었겠어요"), []);
  assert.deepEqual(days("One day at a time."), []);
  assert.deepEqual(days("한 일이 많았네요"), []);
});

test("checkElapsed: 일은 ±1일, 큰 단위는 반 단위 + 1일까지 받는다", () => {
  assert.deepEqual(checkElapsed("3일 만이에요", 4).mismatched, []);
  assert.equal(checkElapsed("3일 만이에요", 5).mismatched.length, 1);
  assert.deepEqual(checkElapsed("석 달 만이에요", 92).mismatched, []);
  assert.deepEqual(checkElapsed("2주 만이에요", 10).mismatched, []);
  assert.equal(checkElapsed("2주 만이에요", 30).mismatched.length, 1);
  assert.equal(checkElapsed("일주일 만이에요", 90).mismatched.length, 1);
  const none = checkElapsed("오랜만이에요", 90);
  assert.deepEqual([none.actualDays, none.mentions, none.mismatched], [90, [], []]);
});
