import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSession } from "./checks.ts";
import {
  flippedPronoun,
  greetingOverlap,
  greetingOverlapText,
  lengthSpread,
  lengthSpreadText,
  MOVE_PATTERNS,
  movePatternsIn,
  moveRates,
  movesIn,
  normalizeGreetingSentence,
  trigramDice,
} from "./moves.ts";

// 모두 지어낸 답이다.

test("movesIn: 감정 추정, 뜻 부여, 허락을 각각 잡는다", () => {
  assert.deepEqual(movesIn("단추가 떠난 뒤 집이 많이 조용하게 느껴지시겠어요."), ["feelingGuess"]);
  assert.deepEqual(movesIn("그 빈자리가 크다는 건 단추를 그만큼 아꼈다는 뜻이에요."), ["meaningGiven"]);
  assert.deepEqual(movesIn("오늘은 울어도 괜찮아요."), ["permission"]);
  assert.deepEqual(movesIn("단추가 창가에 앉아 있던 자리, 아직 그대로네요."), []);
  assert.deepEqual(movesIn("마음이 무거우시겠어요. 그만큼 소중했다는 증거예요. 서두르지 않으셔도 돼요."), [
    "feelingGuess",
    "meaningGiven",
    "permission",
  ]);
});

test("movesIn: 영어는 소문자로 맞춘다", () => {
  assert.deepEqual(movesIn("That must have been so hard."), ["feelingGuess"]);
  assert.deepEqual(movesIn("Missing her Shows How Much she meant."), ["meaningGiven"]);
  assert.deepEqual(movesIn("It's okay to rest today."), ["permission"]);
  assert.deepEqual(movesIn("Tell me about her favorite spot."), []);
});

test("movePatternsIn: 사용자가 그 턴에 직접 쓴 문자열은 세지 않는다", () => {
  assert.deepEqual(movePatternsIn("permission", "울어도 괜찮아요.", ""), ["도 괜찮"]);
  assert.deepEqual(movePatternsIn("permission", "네, 울어도 괜찮아요.", "울어도 괜찮아요?"), []);
  assert.deepEqual(movesIn("그만큼 보고 싶은 거예요.", "그만큼 보고 싶어요"), []);
});

test("MOVE_PATTERNS: 서버 turn_style 의 허락 사전과 같은 문자열", () => {
  assert.deepEqual(MOVE_PATTERNS.permission.ko, ["도 괜찮", "도 돼", "않아도 되", "않으셔도", "그럴 수밖에"]);
});

test("moveRates: 빈 답은 빼고 비율, 답이 없으면 null", () => {
  const rates = moveRates([
    { answer: "많이 힘드시겠어요." },
    { answer: "울어도 괜찮아요." },
    { answer: "단추 이야기를 더 들려주세요." },
    { answer: "그리움은 사랑의 증거예요. 느껴져요." },
    { answer: "  " },
  ]);
  assert.deepEqual(rates, { feelingGuess: 0.5, meaningGiven: 0.25, permission: 0.25, any: 0.75 });
  assert.deepEqual(moveRates([]), { feelingGuess: null, meaningGiven: null, permission: null, any: null });
});

test("flippedPronoun: 사용자의 1인칭을 답이 그대로 가져가면 그 말", () => {
  assert.equal(
    flippedPronoun("두부가 주사 맞을 때 저를 바라봤던 눈이 떠오르네요.", "두부가 마지막에 저를 쳐다봤어요."),
    "저를",
  );
  assert.equal(flippedPronoun("제 탓이라는 생각이 드는군요.", "다 제 탓이에요."), "제");
  // 사용자를 호칭으로 받거나 대명사를 뺐으면 없다.
  assert.equal(flippedPronoun("두부가 보호자님을 바라봤던 눈이 떠오르네요.", "두부가 저를 쳐다봤어요."), null);
  // 사용자가 쓰지 않은 1인칭은 동반자 자신의 말이라 보지 않는다.
  assert.equal(flippedPronoun("제가 곁에서 들을게요.", "두부가 보고 싶어요."), null);
  // "나비"의 "나"는 대명사가 아니다.
  assert.equal(flippedPronoun("나비가 그리우시군요.", "나비가 나를 기다렸어요."), null);
  assert.equal(flippedPronoun("She kept looking at me, you said.", "She kept looking at me."), "at me");
  assert.equal(flippedPronoun("I'm here with you.", "I miss her."), null);
});

test("checkSession: pronounFlip 표시는 턴마다 경고", () => {
  const flags = checkSession({
    language: "ko",
    turns: [
      { answer: "두부를 기다리셨군요.", supportLevel: 1, done: false, user: "두부를 기다렸어요." },
      { answer: "두부가 저를 바라봤던 순간이군요.", supportLevel: 1, done: false, user: "두부가 저를 봤어요." },
    ],
  }).filter((flag) => flag.check === "pronounFlip");
  assert.deepEqual(flags, [{ check: "pronounFlip", level: "warn", detail: '턴 2: "저를"' }]);
});

test("lengthSpread: 빈 답을 빼고 글자 수의 평균과 모집단 표준편차", () => {
  const spread = lengthSpread(["가".repeat(10), "가".repeat(30), " "]);
  assert.deepEqual(spread, { mean: 20, sd: 10, count: 2 });
  assert.equal(lengthSpreadText(spread), "sd 10자 / 평균 20자");
  assert.equal(lengthSpread([]), null);
  assert.equal(lengthSpreadText(null), "-");
});

test("normalizeGreetingSentence: 이름과 조사를 자리 표시로, 공백과 문장부호를 뺀다", () => {
  assert.equal(
    normalizeGreetingSentence("안녕하세요, 나비를 떠나보내신 마음이 무거우시겠어요.", ["나비"]),
    "안녕하세요{이름}떠나보내신마음이무거우시겠어요",
  );
  assert.equal(normalizeGreetingSentence("단풍을 떠나보내신 마음", ["단풍"]), "{이름}떠나보내신마음");
});

test("trigramDice: 같으면 1, 겹침이 없으면 0", () => {
  assert.equal(trigramDice("가나다라", "가나다라"), 1);
  assert.equal(trigramDice("가나다라", "마바사아"), 0);
  assert.ok(trigramDice("가나다라마바사", "가나다라마바자") > 0.6);
});

test("greetingOverlap: 이름만 다른 첫 인사 문장을 같은 문장으로 세어 `n/전체`", () => {
  const overlap = greetingOverlap([
    {
      name: "a",
      greeting: "안녕하세요, 나비를 떠나보내신 마음이 많이 무거우시겠어요. 나비는 어떤 아이였나요?",
      petNames: ["나비"],
    },
    {
      name: "b",
      greeting: "안녕하세요, 초코를 떠나보내신 마음이 많이 무거우시겠어요. 초코 이야기를 들려줘.",
      petNames: ["초코"],
    },
    { name: "c", greeting: "안녕하세요, 단풍을 떠나보내신 마음이 많이 무거우시겠어요.", petNames: ["단풍"] },
    { name: "d", greeting: "오늘 여기 와 주셔서 고마워요.", petNames: ["보리"] },
    { name: "e", greeting: "", petNames: [] },
  ]);
  assert.equal(overlap?.shared, 3);
  assert.equal(overlap?.total, 4);
  assert.deepEqual(overlap?.names, ["a", "b", "c"]);
  assert.equal(overlap?.sentence, "안녕하세요, 나비를 떠나보내신 마음이 많이 무거우시겠어요.");
  assert.equal(greetingOverlapText(overlap), "3/4");
});

test("greetingOverlap: 모두 다르면 1/전체, 인물이 하나면 null", () => {
  const overlap = greetingOverlap([
    { name: "a", greeting: "단추 이야기를 들려주세요.", petNames: ["단추"] },
    { name: "b", greeting: "Tell me about Max.", petNames: ["Max"] },
  ]);
  assert.equal(greetingOverlapText(overlap), "1/2");
  assert.equal(greetingOverlap([{ name: "a", greeting: "안녕하세요.", petNames: [] }]), null);
  assert.equal(greetingOverlapText(null), "-");
});
