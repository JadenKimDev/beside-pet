// 레포 규칙: 범용 타입을 쓰지 않는다.
//
// - TS 의 `any` 는 어김이다(`: any`, `<any>`, `, any>`, `| any`, `as any`, `any[]`).
// - TS 의 `unknown` 은 catch 의 오류와 바깥에서 온 JSON 에서만 쓴다. 허용하는 줄은 `catch (`, `JSON.parse`,
//   `.json()`, `response`, `body` 가 있는 줄과 타입 가드 선언 줄(`): value is X`)이다. 그 밖의 줄에서는
//   `unknown` 하나하나를 보고, 매개변수 이름이 `e`, `err`, `error` 인 것(catch 오류를 받는 도우미와 콜백)만
//   허용한다. 객체의 키나 속성 이름으로 쓴 `unknown`(`unknown: '기타'`, `x.unknown`)은 타입이 아니므로 보지 않는다.
//   `as unknown as` 는 어느 줄이든 어김이다.
// - Rust 의 `dyn Any` 는 어김이다.
//
// 주석과 문자열 안은 보지 않는다. 같은 줄은 규칙마다 한 번만 돌려준다.

import { blankCommentsAndStrings, languageOf, type SourceFile } from "./source-text.ts";

export type GenericTypeUse = { file: string; line: number; text: string; rule: string };

/** `allowed` 는 줄 전체를 허용하는 글, `allowedAt` 은 걸린 자리 하나하나를 허용하는지 보는 함수다. */
type Check = { pattern: RegExp; rule: string; allowed?: RegExp; allowedAt?: (line: string, index: number) => boolean };

/** `unknown` 이 catch 오류를 받는 매개변수(`e`, `err`, `error`)의 타입인가. */
function errorParameter(line: string, index: number): boolean {
  return /\b(?:e|err|error)\s*\??\s*:\s*$/.test(line.slice(0, index));
}

/** `unknown` 이 타입이 아니라 객체의 키(`unknown: 값`)나 속성 이름(`x.unknown`)인가. */
function keyOrProperty(line: string, index: number): boolean {
  const before = line.slice(0, index);
  const after = line.slice(index + "unknown".length);
  return /\.\s*$/.test(before) || (/^\s*\??\s*:/.test(after) && !/:\s*$/.test(before));
}

/** catch 오류 매개변수이거나 키, 속성 이름이면 허용한다. */
function allowedUnknown(line: string, index: number): boolean {
  return errorParameter(line, index) || keyOrProperty(line, index);
}

const TS_CHECKS: Check[] = [
  {
    pattern: /:\s*any\b|<\s*any\b|,\s*any\s*[>,)\]]|\|\s*any\b|\bas\s+any\b|\bany\s*\[\]/,
    rule: "any 를 쓰지 않는다",
  },
  { pattern: /\bas\s+unknown\s+as\b/, rule: "as unknown as 는 쓰지 않는다" },
  {
    pattern: /\bunknown\b/,
    rule: "unknown 은 catch 의 오류와 바깥에서 온 JSON 을 받는 자리에서만 쓴다",
    allowed:
      /\bcatch\s*\(|\bJSON\.parse\b|\.json\(\)|\b(?:response|body)\b|\bas\s+unknown\s+as\b|\)\s*:\s*(?:asserts\s+)?[A-Za-z_$][\w$]*\s+is\s/i,
    allowedAt: allowedUnknown,
  },
];

const RUST_CHECKS: Check[] = [{ pattern: /\bdyn\s+(?:(?:std|core)::any::)?Any\b/, rule: "dyn Any 를 쓰지 않는다" }];

/** 줄에서 `pattern` 에 걸린 자리 가운데 `allowedAt` 이 허용하지 않는 것이 있는가. */
function brokenAt(line: string, pattern: RegExp, allowedAt: (line: string, index: number) => boolean): boolean {
  const every = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  for (const match of line.matchAll(every)) if (!allowedAt(line, match.index)) return true;
  return false;
}

/** 파일에서 범용 타입을 쓴 줄들. 언어는 확장자로 정하고, `.rs` 나 TS 가 아니면 빈 목록이다. */
export function genericTypeViolations(file: SourceFile): GenericTypeUse[] {
  const language = languageOf(file.path);
  if (language === null) return [];
  const checks = language === "rust" ? RUST_CHECKS : TS_CHECKS;
  const original = file.source.split("\n");
  const code = blankCommentsAndStrings(file.source, language).split("\n");
  const found: GenericTypeUse[] = [];
  code.forEach((line, index) => {
    for (const { pattern, rule, allowed, allowedAt } of checks) {
      if (!pattern.test(line) || allowed?.test(line)) continue;
      if (allowedAt && !brokenAt(line, pattern, allowedAt)) continue;
      found.push({ file: file.path, line: index + 1, text: original[index]!.trim(), rule });
    }
  });
  return found;
}
