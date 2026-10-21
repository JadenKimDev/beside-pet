// 개발 기록(`showcase/dev-notes.json`)의 모양과 글을 보는 규칙. 순수 함수만 둔다.
// 파일을 읽는 레포 검사는 `src/checks/dev-notes.test.ts` 에 있다.
//
// 개발 기록은 사용자가 읽는 글이다(#36). 그래서 ADR-0003 의 금지어와, 사용자가 알 수 없는 코드 이름
// (백틱, 대문자 환경 변수 꼴, 이슈 번호 `#숫자`, GitHub 링크)을 제목과 설명에 두지 않는다.
// 날짜 순서는 보지 않는다: 화면이 정렬한다.

export const DEV_NOTE_KINDS = ["bug", "feature", "improvement", "planned"] as const;

export type DevNoteKind = (typeof DEV_NOTE_KINDS)[number];

/** 파일에서 읽은 JSON 값. `config.ts` 의 것과 같은 꼴이다. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** 발견 하나. `entry` 는 `entries` 안의 자리(0부터)이고, 최상위 모양의 발견이면 null 이다. */
export type DevNoteFinding = { entry: number | null; rule: string; detail: string };

/**
 * ADR-0003 의 금지어. `apps/web/i18n/banned-words.ts` 와 같은 목록이다(dev-tools 는 apps/web 을 가져오지 않는다).
 * 한국어는 낱말 안(상담사, 치료법)도 잡는다.
 */
const BANNED: readonly RegExp[] = [
  /\bcounsel(?:ing|ling|or|lor|ors|lors)?\b/i,
  /\btherap(?:y|ies|ist|ists|eutic)\b/i,
  /\btreatments?\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bdiagnos(?:e|es|is|ed|ing)\b/i,
  /\bcure[sd]?\b/i,
  /\bpatients?\b/i,
  /상담/,
  /치료/,
];

/** 이 제품이 아니라 바깥 기관의 이름이라 금지어 검사에서 뺀다. */
const PROPER_NAMES: readonly string[] = ["자살예방상담전화"];

/** 사용자의 글에 있으면 안 되는 코드 이름의 꼴. */
const CODE_NAMES: readonly { rule: string; pattern: RegExp }[] = [
  { rule: "backtick", pattern: /`/ },
  { rule: "envName", pattern: /\b[A-Z][A-Z0-9_]{2,}\b/ },
  { rule: "issueNumber", pattern: /#\d+/ },
  { rule: "githubLink", pattern: /github\.com/i },
];

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` 꼴이고 달력에 있는 날짜인가. */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isRecord(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilledText(value: Json | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** 글 하나에서 걸리는 금지어와 코드 이름. */
export function textFindings(text: string): { rule: string; detail: string }[] {
  const found: { rule: string; detail: string }[] = [];
  const plain = PROPER_NAMES.reduce((acc, name) => acc.split(name).join(""), text);
  for (const pattern of BANNED) {
    const match = pattern.exec(plain);
    if (match) found.push({ rule: "bannedWord", detail: match[0] });
  }
  for (const { rule, pattern } of CODE_NAMES) {
    const match = pattern.exec(text);
    if (match) found.push({ rule, detail: match[0] });
  }
  return found;
}

function entryFindings(entry: Json, at: number): DevNoteFinding[] {
  if (!isRecord(entry)) {
    return [{ entry: at, rule: "shape", detail: "항목이 객체가 아닙니다" }];
  }
  const found: DevNoteFinding[] = [];
  const add = (rule: string, detail: string): void => {
    found.push({ entry: at, rule, detail });
  };
  if (typeof entry.date !== "string" || !isCalendarDate(entry.date)) {
    add("date", `날짜가 YYYY-MM-DD 의 실제 날짜가 아닙니다: ${JSON.stringify(entry.date)}`);
  }
  if (typeof entry.kind !== "string" || !(DEV_NOTE_KINDS as readonly string[]).includes(entry.kind)) {
    add("kind", `종류가 ${DEV_NOTE_KINDS.join(" | ")} 가 아닙니다: ${JSON.stringify(entry.kind)}`);
  }
  if (typeof entry.issue !== "number" || !Number.isInteger(entry.issue) || entry.issue <= 0) {
    add("issue", `issue 가 양의 정수가 아닙니다: ${JSON.stringify(entry.issue)}`);
  }
  for (const field of ["title", "body"] as const) {
    const value = entry[field];
    if (!isFilledText(value)) {
      add("text", `${field} 가 비었거나 문자열이 아닙니다`);
      continue;
    }
    for (const hit of textFindings(value)) {
      add(hit.rule, `${field}: ${hit.detail}`);
    }
  }
  return found;
}

/** 이미 읽은 JSON 값에서 발견을 모은다. 없으면 빈 배열이다. */
export function devNotesFindings(json: Json): DevNoteFinding[] {
  if (!isRecord(json) || !Array.isArray(json.entries)) {
    return [{ entry: null, rule: "shape", detail: "최상위에 entries 배열이 없습니다" }];
  }
  return json.entries.flatMap((entry, at) => entryFindings(entry, at));
}

/** 파일의 글에서 발견을 모은다. JSON 이 아니면 그것을 발견 하나로 돌려준다. */
export function parseDevNotes(text: string): DevNoteFinding[] {
  let json: Json;
  try {
    json = JSON.parse(text) as Json;
  } catch (error) {
    return [{ entry: null, rule: "json", detail: `JSON 이 아닙니다: ${(error as Error).message}` }];
  }
  return devNotesFindings(json);
}

/** 사람이 읽는 한 줄씩. */
export function findingLines(findings: readonly DevNoteFinding[]): string[] {
  return findings.map((f) => `${f.entry === null ? "(최상위)" : `entries[${f.entry}]`} ${f.rule}: ${f.detail}`);
}
