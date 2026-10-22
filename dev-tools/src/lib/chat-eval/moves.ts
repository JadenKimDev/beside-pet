// 답의 "동작" 검사(#37). 문자열이 매번 달라도 같은 동작(감정 추정, 뜻 부여, 허락)이 되풀이되는지를 잰다.
// 모두 순수 함수다. 패턴은 조사 보고서(2026-10-22 comfort-voice 후속) 2.1절의 T1~T3 과 5.2절의 정의를 따른다.

import type { SessionTurn } from "./checks.ts";

/** 세 동작. 보고서의 T1(감정 추정), T2(뜻 부여), T3(허락·정상화). */
export type MoveId = "feelingGuess" | "meaningGiven" | "permission";

export const MOVE_IDS: readonly MoveId[] = ["feelingGuess", "meaningGiven", "permission"];

/**
 * 세 동작의 사전. 서버의 `apps/server/src/support/rules/turn_style.rs` 와 같은 문자열이다(#37 S3).
 * 정규식이 아니라 부분 문자열이고, 영어는 답을 소문자로 바꿔 맞춘다. 사용자가 그 턴에 직접 쓴 문자열은 세지 않는다.
 */
export const MOVE_PATTERNS: Record<MoveId, { ko: readonly string[]; en: readonly string[] }> = {
  feelingGuess: {
    ko: [
      "것 같아요",
      "것 같네요",
      "셨겠",
      "겠어요",
      "겠네요",
      "겠죠",
      "나 봐요",
      "짐작",
      "느껴져요",
      "느껴지시",
      "느껴지네",
      "실 거예요",
      "실 것 같",
      "하시겠",
      "힘드시",
      "무거우시",
      "아프시",
      "지치실",
    ],
    en: [
      "must have felt",
      "must have been",
      "you must feel",
      "you must be",
      "i imagine you",
      "i can imagine",
      "can only imagine",
      "you probably felt",
    ],
  },
  meaningGiven: {
    ko: [
      "뜻이",
      "뜻일",
      "때문일 거",
      "보여 주",
      "보여주",
      "증거",
      "그만큼",
      "기억하는 방식",
      "받아들이는 중",
      "붙잡고 계신",
    ],
    en: ["shows how much", "a sign of", "proof of", "is how love", "reflects how much", "means you loved"],
  },
  permission: {
    ko: ["도 괜찮", "도 돼", "않아도 되", "않으셔도", "그럴 수밖에"],
    en: [
      "it's okay to",
      "it’s okay to",
      "it is okay to",
      "it's ok to",
      "you don't have to",
      "you don’t have to",
      "you do not have to",
      "it's alright to",
      "give yourself permission",
    ],
  },
};

/** 답에 든 그 동작의 패턴. 사용자 말(`user`)에 같은 문자열이 있으면 뺀다. */
export function movePatternsIn(id: MoveId, answer: string, user = ""): string[] {
  const { ko, en } = MOVE_PATTERNS[id];
  const [answerLower, userLower] = [answer.toLowerCase(), user.toLowerCase()];
  return [
    ...ko.filter((p) => answer.includes(p) && !user.includes(p)),
    ...en.filter((p) => answerLower.includes(p) && !userLower.includes(p)),
  ];
}

/** 답 하나에 담긴 동작. */
export function movesIn(answer: string, user = ""): MoveId[] {
  return MOVE_IDS.filter((id) => movePatternsIn(id, answer, user).length > 0);
}

/** 동작마다, 그리고 셋 중 하나라도(`any`) 담긴 답의 비율(0~1). 빈 답은 세지 않고, 답이 없으면 모두 null. */
export type MoveRates = Record<MoveId | "any", number | null>;

export type MoveTurn = { answer: string; user?: string };

export function moveRates(turns: MoveTurn[]): MoveRates {
  const moves = turns.filter((turn) => turn.answer.trim() !== "").map((turn) => movesIn(turn.answer, turn.user));
  const rate = (hit: (found: MoveId[]) => boolean): number | null =>
    moves.length === 0 ? null : moves.filter(hit).length / moves.length;
  return {
    feelingGuess: rate((found) => found.includes("feelingGuess")),
    meaningGiven: rate((found) => found.includes("meaningGiven")),
    permission: rate((found) => found.includes("permission")),
    any: rate((found) => found.length > 0),
  };
}

// ── 대명사 뒤집힘 ──

/** 한국어 1인칭 어절: 저/나 + 조사, 제/내 + 가·게. "제 얼굴"의 "제"처럼 관형으로 쓰인 것도 든다. */
const FIRST_PERSON_KO = /^(?:(?:저|나)(?:를|는|도|만|한테|에게|랑|와|의|보고)?|(?:제|내)(?:가|게|겐)?)$/;
/** 영어 1인칭. 영어는 동반자도 자기를 "I"로 부르므로 낱말 하나가 아니라 사용자의 두 낱말 묶음으로 본다. */
const FIRST_PERSON_EN = /^(?:me|my|myself|mine)$/i;

function words(text: string): string[] {
  return text
    .replace(/[()?!.,"'…~？！。“”‘’]/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

/**
 * 사용자의 1인칭을 동반자가 그대로 가져가 자기를 가리키게 된 말. 없으면 null.
 * 한국어: 사용자가 쓴 1인칭 어절(저를, 제 …)이 답에도 그대로 있다.
 * 영어: 사용자의 두 낱말 묶음 가운데 me/my 가 든 것("at me", "my fault")이 답에도 그대로 있다.
 */
export function flippedPronoun(answer: string, user: string): string | null {
  const userWords = words(user);
  const answerWords = words(answer);
  const answerSet = new Set(answerWords);
  const ko = userWords.find((word) => FIRST_PERSON_KO.test(word) && answerSet.has(word));
  if (ko !== undefined) return ko;
  const lower = (list: string[]) => list.map((word) => word.toLowerCase());
  const [u, a] = [lower(userWords), lower(answerWords)];
  const answerPairs = new Set(a.slice(1).map((word, i) => `${a[i]} ${word}`));
  for (let i = 0; i + 1 < u.length; i++) {
    const pair = `${u[i]} ${u[i + 1]}`;
    if ((FIRST_PERSON_EN.test(u[i] as string) || FIRST_PERSON_EN.test(u[i + 1] as string)) && answerPairs.has(pair))
      return pair;
  }
  return null;
}

/** 턴마다, 답이 그 턴의 사용자 1인칭을 가져갔는가. 사용자 말이 없는 턴은 보지 않는다. */
export function pronounFlip(turns: SessionTurn[]) {
  return turns.flatMap((turn, index) => {
    if (turn.user === undefined || turn.user.trim() === "") return [];
    const flipped = flippedPronoun(turn.answer, turn.user);
    if (flipped === null) return [];
    return [{ check: "pronounFlip" as const, level: "warn" as const, detail: `턴 ${index + 1}: "${flipped}"` }];
  });
}

// ── 길이 분산 ──

/** 답 길이(공백 포함 글자 수)의 평균과 표준편차(모집단). 빈 답은 세지 않고, 답이 없으면 null. */
export type LengthSpread = { mean: number; sd: number; count: number };

export function lengthSpread(answers: string[]): LengthSpread | null {
  const lengths = answers.filter((answer) => answer.trim() !== "").map((answer) => [...answer.trim()].length);
  if (lengths.length === 0) return null;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  return { mean, sd: Math.sqrt(variance), count: lengths.length };
}

/** `표준편차 32자 / 평균 140자` 꼴. 답이 없으면 `-`. */
export function lengthSpreadText(spread: LengthSpread | null): string {
  if (spread === null) return "-";
  return `sd ${Math.round(spread.sd)}자 / 평균 ${Math.round(spread.mean)}자`;
}

// ── 첫 인사 겹침 ──

/** 이름 자리 표시. 반려동물 이름과 그 뒤의 조사를 이것으로 바꾼 뒤 견준다. */
const NAME_SLOT = "{이름}";
/** 두 문장의 글자 3-gram 다이스 계수가 이 이상이면 같은 문장으로 본다("글자까지 거의 같음"). */
const SAME_SENTENCE = 0.8;

/**
 * 정규화한 키가 이보다 짧은 문장은 겹침 후보에서 뺀다. "안녕하세요", "반갑습니다" 같은 인사 한 마디는
 * 내용이 아니어서, 모든 인물이 같은 한 마디로 시작하면 내용 문장의 겹침을 가린다.
 */
const MIN_GREETING_KEY = 8;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 인사 한 문장을 견줄 꼴로: 이름과 조사를 자리 표시로, 공백과 문장부호를 뺀다. */
export function normalizeGreetingSentence(sentence: string, petNames: string[]): string {
  let text = sentence;
  for (const name of petNames.filter((n) => n !== "")) {
    text = text.replace(
      new RegExp(`${escapeRegExp(name)}(?:이를|이가|이는|이와|이의|을|를|이|가|은|는|와|과|아|야|의)?`, "g"),
      NAME_SLOT,
    );
  }
  return text.replace(/[\s.,!?。？！…~"'“”]/g, "");
}

function trigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  const chars = [...text];
  for (let i = 0; i + 3 <= chars.length; i++) {
    const gram = chars.slice(i, i + 3).join("");
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** 글자 3-gram 다이스 계수(0~1). 짧아서 3-gram 이 없으면 같은 글일 때만 1. */
export function trigramDice(a: string, b: string): number {
  if (a === b) return 1;
  const [ga, gb] = [trigrams(a), trigrams(b)];
  const total = [...ga.values(), ...gb.values()].reduce((x, y) => x + y, 0);
  if (total === 0) return 0;
  let shared = 0;
  for (const [gram, n] of ga) shared += Math.min(n, gb.get(gram) ?? 0);
  return (2 * shared) / total;
}

export type GreetingInput = { name: string; greeting: string; petNames: string[] };

/** 가장 많은 인물이 공유한 첫 인사 문장: 그 문장(첫 인물의 원문), 공유한 인물 수, 첫 인사가 있는 인물 수. */
export type GreetingOverlap = { sentence: string; shared: number; total: number; names: string[] };

function greetingSentences(greeting: string): string[] {
  return greeting
    .split(/(?<=[.!?。？！\n])\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** 인물 간 첫 인사의 같은 문장. 첫 인사가 있는 인물이 둘 미만이면 null. */
export function greetingOverlap(inputs: GreetingInput[]): GreetingOverlap | null {
  const people = inputs
    .filter((input) => input.greeting.trim() !== "")
    .map((input) => ({
      name: input.name,
      sentences: greetingSentences(input.greeting).map((raw) => ({
        raw,
        key: normalizeGreetingSentence(raw, input.petNames),
      })),
    }));
  if (people.length < 2) return null;
  let best: GreetingOverlap = { sentence: "", shared: 0, total: people.length, names: [] };
  for (const person of people) {
    for (const sentence of person.sentences) {
      if ([...sentence.key].length < MIN_GREETING_KEY) continue;
      const names = people
        .filter((other) => other.sentences.some((s) => trigramDice(s.key, sentence.key) >= SAME_SENTENCE))
        .map((other) => other.name);
      if (names.length > best.shared)
        best = { sentence: sentence.raw, shared: names.length, total: people.length, names };
    }
  }
  return best;
}

/** `5/7` 꼴. 없으면 `-`. */
export function greetingOverlapText(overlap: GreetingOverlap | null): string {
  return overlap === null ? "-" : `${overlap.shared}/${overlap.total}`;
}
