// 규칙들이 함께 쓰는 소스 글 다루기. 주석과 문자열 글자를 빈칸으로 바꿔, 그 안의 `{`, `any`, 경로를 규칙이 보지
// 않게 한다. 줄바꿈과 글자 수는 그대로라 바꾼 글의 자리(줄, 칸)가 원본과 같다.
//
// 문법을 다 읽지 않는 대충의 처리다. Rust 는 겹친 블록 주석, 날 문자열(`r#"…"#`), 글자(`'x'`)와 수명(`'a`)을
// 가르고, TS 는 따옴표 셋과 정규식 글자를 앞 글자로 가른다(템플릿의 `${}` 안도 통째로 지운다).

export type Language = "rust" | "ts";
/** 경로와 소스 글. 경로의 기준은 부르는 쪽이 정한다. */
export type SourceFile = { path: string; source: string };

/** 확장자로 언어를 정한다. `.rs` 는 Rust, `.ts`, `.tsx`, `.mts`, `.cts` 는 TS, 나머지는 `null`. */
export function languageOf(path: string): Language | null {
  if (path.endsWith(".rs")) return "rust";
  return /\.[mc]?tsx?$/.test(path) ? "ts" : null;
}

/** 줄바꿈만 남기고 모든 글자를 빈칸으로 바꾼 글. */
export function blankKeepingLines(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

const IDENT = /[A-Za-z0-9_$]/;

/** Rust 의 `'` 가 글자 하나의 시작이면 그 끝(닫는 `'` 다음) 자리, 수명이면 `null`. */
function rustCharEnd(source: string, i: number): number | null {
  if (source[i + 1] === "\\") {
    const close = source.indexOf("'", i + 3);
    return close === -1 ? null : close + 1;
  }
  const code = source.codePointAt(i + 1);
  if (code === undefined) return null;
  const width = code > 0xffff ? 2 : 1;
  return source[i + 1 + width] === "'" ? i + 2 + width : null;
}

/** 자리 `i` 에서 시작하는 Rust 날 문자열(`r"…"`, `r#"…"#`, `br#"…"#`)의 끝, 아니면 `null`. */
function rustRawStringEnd(source: string, i: number): number | null {
  if (i > 0 && IDENT.test(source[i - 1]!)) return null;
  let j = i;
  if (source[j] === "b") j += 1;
  if (source[j] !== "r") return null;
  j += 1;
  let hashes = 0;
  while (source[j] === "#") {
    hashes += 1;
    j += 1;
  }
  if (source[j] !== '"') return null;
  const close = source.indexOf(`"${"#".repeat(hashes)}`, j + 1);
  return close === -1 ? source.length : close + 1 + hashes;
}

/** 따옴표 `quote` 로 연 문자열의 끝(닫는 따옴표 다음). `\` 뒤 글자는 넘는다. */
function quotedEnd(source: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < source.length && source[j] !== quote) j += source[j] === "\\" ? 2 : 1;
  return Math.min(j + 1, source.length);
}

/** 겹칠 수 있는(Rust) 또는 겹치지 않는(TS) 블록 주석의 끝. */
function blockCommentEnd(source: string, i: number, nested: boolean): number {
  let depth = 0;
  let j = i;
  while (j < source.length) {
    if (source.startsWith("/*", j) && (nested || depth === 0)) {
      depth += 1;
      j += 2;
    } else if (source.startsWith("*/", j)) {
      depth -= 1;
      j += 2;
      if (depth === 0) return j;
    } else {
      j += 1;
    }
  }
  return source.length;
}

const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "delete",
  "void",
  "throw",
  "new",
  "else",
  "do",
]);

/** TS 에서 `/` 가 정규식 글자의 시작인가. 앞의 의미 있는 글자로 가른다. */
function startsRegex(out: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(out[j]!)) j -= 1;
  if (j < 0) return true;
  const prev = out[j]!;
  if ("(,=:[!&|?{};+-*%<>~^".includes(prev)) return true;
  if (!IDENT.test(prev)) return false;
  let k = j;
  while (k >= 0 && IDENT.test(out[k]!)) k -= 1;
  return REGEX_KEYWORDS.has(out.slice(k + 1, j + 1));
}

/** 정규식 글자의 끝(닫는 `/` 와 깃발 다음). 줄이 끝나면 정규식이 아니었던 것으로 보고 `null`. */
function regexEnd(source: string, i: number): number | null {
  let j = i + 1;
  let inClass = false;
  while (j < source.length) {
    const ch = source[j]!;
    if (ch === "\n") return null;
    if (ch === "\\") j += 2;
    else {
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      j += 1;
    }
  }
  if (j >= source.length) return null;
  j += 1;
  while (j < source.length && /[a-z]/i.test(source[j]!)) j += 1;
  return j;
}

/**
 * 주석과 문자열 글자를 빈칸으로 바꾼 글. 길이와 줄바꿈은 원본과 같다. `strings` 가 `"keep"` 이면 주석만 지우고
 * 문자열(TS 의 정규식 글자도)은 그대로 둔다.
 */
export function blankCommentsAndStrings(
  source: string,
  language: Language,
  strings: "blank" | "keep" = "blank",
): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    let end: number | null = null;
    let comment = true;
    if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      end = newline === -1 ? source.length : newline;
    } else if (source.startsWith("/*", i)) {
      end = blockCommentEnd(source, i, language === "rust");
    } else if (language === "rust") {
      comment = false;
      if (ch === '"') end = quotedEnd(source, i, '"');
      else if (ch === "'") end = rustCharEnd(source, i);
      else if (ch === "r" || ch === "b") end = rustRawStringEnd(source, i);
    } else if (ch === '"' || ch === "'" || ch === "`") {
      comment = false;
      end = quotedEnd(source, i, ch);
    } else if (ch === "/" && startsRegex(out, i)) {
      comment = false;
      end = regexEnd(source, i);
    }
    if (end === null) {
      out += ch;
      i += 1;
    } else {
      const text = source.slice(i, end);
      out += comment || strings === "blank" ? blankKeepingLines(text) : text;
      i = end;
    }
  }
  return out;
}

/** 글 안의 자리(글자 수)를 줄 번호(1부터)로 바꾸는 함수. 줄의 시작 자리를 한 번 모아 두고 이분 탐색한다. */
export function lineLocator(text: string): (index: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  return (index) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}
