// 대화 실측의 인물 파일(`dev-tools/chat-eval/personas/<이름>.json`)을 읽고 검증한다.
//
// 모양이 틀리면 대화를 시작하기 전에 `<파일>: <칸> <이유>` 로 던진다. 프로필 안쪽의 칸 이름과 허용값은
// 서버의 `POST /v1/sessions` 요청 검증(`apps/server/src/support/request.rs` 의 `grief_profile`)을 그대로 따른다.
// 서버가 받지 않을 프로필은 여기서 먼저 막아, 실측 도중 400 으로 멈추지 않게 한다.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type Language = "ko" | "en";

/** 서버의 `GriefProfileRequest` 와 같은 모양. 요청 본문의 `griefProfile` 에 그대로 넣는다. */
export type GriefProfile = {
  griefPath: "afterLoss" | "beforeLoss";
  petName?: string;
  togetherRange?: "0-3" | "4-7" | "8-11" | "12+";
  lossType?: "sudden" | "illness" | "natural" | "euthanasia" | "unknown";
  situation?: "aging" | "endOfLife" | "ongoingCare" | "other";
  /** 서버 검증이 정수이고 0 이상이다(`must be an integer number`). */
  weeksSinceLoss?: number;
  dailyState?: { sleep?: "ok" | "fair" | "disturbed"; eating?: "ok" | "reduced" };
  preferredLanguage?: Language;
};

/** 인물에게 기대하는 결과. `crisisAtTurn` 은 1 부터 세는 사용자 턴 번호다(첫 인사는 세지 않는다). */
export type PersonaExpect = { crisisAtTurn?: number; noCrisis?: boolean; minTask?: number };

export type Persona = {
  /** 파일 이름(확장자 뺀 것)과 같다. `--persona` 로 고르는 이름이다. */
  name: string;
  situation: string;
  language: Language;
  /** `null` 이면 프로필 없이 시작해 서버가 기록에서 이어 간다(재개). */
  profile: GriefProfile | null;
  turns: string[];
  expect?: PersonaExpect;
};

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** 칸 하나의 허용값. 문자열 목록이면 그중 하나, 그 밖은 종류. */
type FieldRule = readonly string[] | "string" | "nonNegativeInt" | "object";

const PERSONA_FIELDS = ["name", "situation", "language", "profile", "turns", "expect"] as const;
const LANGUAGES = ["ko", "en"] as const;

const PROFILE_RULES: Record<string, FieldRule> = {
  griefPath: ["afterLoss", "beforeLoss"],
  petName: "string",
  togetherRange: ["0-3", "4-7", "8-11", "12+"],
  lossType: ["sudden", "illness", "natural", "euthanasia", "unknown"],
  situation: ["aging", "endOfLife", "ongoingCare", "other"],
  weeksSinceLoss: "nonNegativeInt",
  dailyState: "object",
  preferredLanguage: LANGUAGES,
};

const DAILY_STATE_RULES: Record<string, FieldRule> = {
  sleep: ["ok", "fair", "disturbed"],
  eating: ["ok", "reduced"],
};

export function isObject(value: Json | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

export function fail(file: string, field: string, reason: string): never {
  throw new Error(`${file}: ${field} ${reason}`);
}

/** 모르는 칸이 있으면 던진다. `prefix` 는 오류에 쓸 칸 경로의 앞부분이다. */
export function rejectUnknown(file: string, data: JsonObject, known: readonly string[], prefix: string): void {
  for (const key of Object.keys(data)) {
    if (!known.includes(key)) fail(file, `${prefix}${key}`, "는 모르는 칸입니다");
  }
}

function checkRule(file: string, field: string, value: Json, rule: FieldRule): void {
  if (rule === "string") {
    if (typeof value !== "string") fail(file, field, "는 문자열입니다");
  } else if (rule === "nonNegativeInt") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(file, field, "는 0 이상의 정수입니다");
  } else if (rule === "object") {
    if (!isObject(value)) fail(file, field, "는 객체입니다");
  } else if (typeof value !== "string" || !rule.includes(value)) {
    fail(file, field, `는 ${rule.join(", ")} 중 하나입니다`);
  }
}

/** 칸마다 규칙을 대 본다. 서버처럼 `null` 인 선택 칸은 없는 것으로 친다. */
function checkFields(file: string, data: JsonObject, rules: Record<string, FieldRule>, prefix: string): void {
  rejectUnknown(file, data, Object.keys(rules), prefix);
  for (const [key, value] of Object.entries(data)) {
    const rule = rules[key];
    if (value !== null && rule !== undefined) checkRule(file, `${prefix}${key}`, value, rule);
  }
}

export function parseProfile(file: string, value: Json | undefined): GriefProfile | null {
  if (value === undefined) fail(file, "profile", "이 없습니다(재개면 null)");
  if (value === null) return null;
  if (!isObject(value)) fail(file, "profile", "는 객체이거나 null 입니다");
  checkFields(file, value, PROFILE_RULES, "profile.");
  if (value.griefPath === undefined || value.griefPath === null) fail(file, "profile.griefPath", "가 없습니다");
  const daily = value.dailyState;
  if (isObject(daily)) checkFields(file, daily, DAILY_STATE_RULES, "profile.dailyState.");
  // 칸 이름과 허용값을 위에서 모두 대 보았으므로 서버 요청 모양과 같다.
  return value as GriefProfile;
}

function positiveInt(file: string, field: string, value: Json): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) fail(file, field, "는 1 이상의 정수입니다");
  return value;
}

function parseExpect(file: string, value: Json | undefined): PersonaExpect | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) fail(file, "expect", "는 객체입니다");
  rejectUnknown(file, value, ["crisisAtTurn", "noCrisis", "minTask"], "expect.");
  const expect: PersonaExpect = {};
  if (value.crisisAtTurn !== undefined)
    expect.crisisAtTurn = positiveInt(file, "expect.crisisAtTurn", value.crisisAtTurn);
  if (value.minTask !== undefined) expect.minTask = positiveInt(file, "expect.minTask", value.minTask);
  if (value.noCrisis !== undefined) {
    if (typeof value.noCrisis !== "boolean") fail(file, "expect.noCrisis", "는 true 나 false 입니다");
    expect.noCrisis = value.noCrisis;
  }
  if (expect.noCrisis === true && expect.crisisAtTurn !== undefined) {
    fail(file, "expect", "에 noCrisis 와 crisisAtTurn 을 함께 둘 수 없습니다");
  }
  return expect;
}

export function requiredString(file: string, data: JsonObject, field: string): string {
  const value = data[field];
  if (value === undefined || value === null) fail(file, field, "이 없습니다");
  if (typeof value !== "string" || value.trim() === "") fail(file, field, "는 빈칸 아닌 문자열입니다");
  return value;
}

function parseTurns(file: string, value: Json | undefined): string[] {
  if (value === undefined || value === null) fail(file, "turns", "가 없습니다");
  if (!Array.isArray(value) || value.length === 0) fail(file, "turns", "는 빈 배열이 아닌 배열입니다");
  return value.map((turn, index) => {
    if (typeof turn !== "string" || turn.trim() === "") fail(file, `turns[${index}]`, "는 빈칸 아닌 문자열입니다");
    return turn;
  });
}

/** 인물 파일의 글을 검증해 읽는다. `file` 은 오류 문구에 쓰는 파일 이름이고, 확장자 뺀 것이 `name` 과 같아야 한다. */
export function parsePersona(file: string, text: string): Persona {
  let raw: Json;
  try {
    raw = JSON.parse(text) as Json;
  } catch (error) {
    throw new Error(`${file}: JSON 이 아닙니다 (${(error as Error).message})`);
  }
  if (!isObject(raw)) throw new Error(`${file}: 객체가 아닙니다`);
  rejectUnknown(file, raw, PERSONA_FIELDS, "");
  const name = requiredString(file, raw, "name");
  const stem = basename(file).replace(/\.json$/, "");
  if (name !== stem) fail(file, "name", `은 파일 이름(${stem})과 같아야 합니다`);
  const language = requiredString(file, raw, "language");
  if (language !== "ko" && language !== "en") fail(file, "language", "는 ko, en 중 하나입니다");
  const persona: Persona = {
    name,
    situation: requiredString(file, raw, "situation"),
    language,
    profile: parseProfile(file, raw.profile),
    turns: parseTurns(file, raw.turns),
  };
  const expect = parseExpect(file, raw.expect);
  if (expect !== undefined) persona.expect = expect;
  return persona;
}

export function loadPersona(path: string): Persona {
  return parsePersona(basename(path), readFileSync(path, "utf8"));
}

/** 폴더의 인물 파일을 모두 읽어 이름순으로 돌려준다. 하나라도 틀리면 던진다. */
export function loadPersonas(dir: string): Persona[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => loadPersona(join(dir, entry)));
}

/** 레포 루트에서 인물 폴더의 경로. */
export function personasDir(root: string): string {
  return join(root, "dev-tools", "chat-eval", "personas");
}

/** 검사에서 빼야 할 반려동물 이름. 재개 인물(프로필 없음)은 빈 배열이다. */
export function petNamesOf(persona: Persona): string[] {
  const name = persona.profile?.petName;
  return name ? [name] : [];
}
