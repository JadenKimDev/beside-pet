// 레포 규칙: 같은 일을 하는 함수를 이름만 바꿔 다시 만들지 않는다.
//
// Rust 의 `fn name(…) { … }`, TS 의 `function name(…) { … }` 와 `const name = (…) => { … }` 의 몸체를 뽑아
// 주석과 공백을 지우고 해시한다. 같은 해시가 다른 이름으로 둘 이상이면 한 묶음이다. 안쪽 줄(여는 `{` 와 닫는 `}`
// 사이의 원본 줄)이 열 줄 이하인 짧은 몸체는 뺀다(getter 가 다 걸린다). 문자열은 지우지 않아서, 글만 다른 함수는
// 같다고 보지 않는다. TS 클래스의 메서드는 보지 않는다.

import { createHash } from "node:crypto";
import { blankCommentsAndStrings, languageOf, lineLocator, type SourceFile } from "./source-text.ts";

/** 함수 하나. `line` 은 이름이 있는 줄, `lines` 는 몸체의 안쪽 줄 수, `hash` 는 정규화한 몸체의 해시다. */
export type FunctionBody = { file: string; line: number; name: string; lines: number; hash: string };
export type DuplicateGroup = { hash: string; functions: { file: string; line: number; name: string }[] };

const OPEN = "([<";
const CLOSE = ")]>";

/** `code[at]` 의 여는 괄호(`(`, `{`, `<`, `[`)와 짝인 닫는 괄호의 자리. 같은 종류만 센다. 없으면 `-1`. */
function matching(code: string, at: number): number {
  const open = code[at]!;
  const close = { "(": ")", "{": "}", "<": ">", "[": "]" }[open];
  let depth = 0;
  for (let i = at; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === open) depth += 1;
    else if (ch === close && !(close === ">" && (code[i - 1] === "-" || code[i - 1] === "="))) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `at` 앞의 공백 아닌 글자. */
function previousChar(code: string, at: number): string {
  let i = at - 1;
  while (i >= 0 && /\s/.test(code[i]!)) i -= 1;
  return i < 0 ? "" : code[i]!;
}

function skipSpace(code: string, at: number): number {
  let i = at;
  while (i < code.length && /\s/.test(code[i]!)) i += 1;
  return i;
}

/**
 * 매개변수의 닫는 `)` 다음부터 몸체의 여는 `{` 를 찾는다. 반환 타입과 `where` 절은 넘고, 타입 자리의 `{`
 * (`: {`, `| {` 뒤)는 객체 타입으로 보고 건넌다. `arrow` 면 깊이 0 의 `=>` 다음에 `{` 가 와야 한다.
 * 타입 자리의 `{` 는 TS 에만 있어서(`typeBraces`) Rust 의 `where T: Clone,` 뒤 `{` 는 몸체다. 앞 글자는
 * 문자열을 남긴 글(`context`)에서 본다. 지운 글에서는 `Kind | "none" {` 의 앞 글자가 `|` 로 보이기 때문이다.
 * `;` 를 먼저 만나거나(몸체 없는 선언) 화살표 뒤가 `{` 가 아니면 `-1`.
 */
function bodyStart(code: string, context: string | null, at: number, arrow: boolean): number {
  let depth = 0;
  for (let i = at; i < code.length; i += 1) {
    const ch = code[i]!;
    if (depth === 0 && arrow && code.startsWith("=>", i)) {
      const next = skipSpace(code, i + 2);
      return code[next] === "{" ? next : -1;
    }
    if (ch === "-" && code[i + 1] === ">") {
      i += 1;
      continue;
    }
    if (OPEN.includes(ch)) depth += 1;
    else if (CLOSE.includes(ch)) depth -= 1;
    else if (depth === 0 && ch === ";") return -1;
    else if (ch === "{") {
      const typeBrace = context !== null && ":|&,".includes(previousChar(context, i));
      if (depth === 0 && !arrow && !typeBrace) return i;
      const end = matching(code, i);
      if (end === -1) return -1;
      i = end;
    }
  }
  return -1;
}

/** 이름 다음 자리에서 매개변수(`(…)` 또는 화살표의 이름 하나)를 넘은 자리. 제네릭 `<…>` 도 넘는다. */
function afterParameters(code: string, at: number, arrow: boolean): number {
  let i = skipSpace(code, at);
  if (code[i] === "<") {
    const end = matching(code, i);
    if (end === -1) return -1;
    i = skipSpace(code, end + 1);
  }
  if (code[i] === "(") {
    const end = matching(code, i);
    return end === -1 ? -1 : end + 1;
  }
  if (!arrow) return -1;
  const name = /^[A-Za-z_$][\w$]*/.exec(code.slice(i));
  return name ? i + name[0].length : -1;
}

const RUST_FN = /\bfn\s+([A-Za-z_]\w*)/g;
const TS_FUNCTION = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g;
const TS_ARROW = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:async\s+)?(?=[(<A-Za-z_$])/g;

type Found = { index: number; name: string; open: number; close: number };

function findFunctions(code: string, context: string | null, pattern: RegExp, arrow: boolean): Found[] {
  const found: Found[] = [];
  for (const match of code.matchAll(pattern)) {
    const params = afterParameters(code, match.index + match[0].length, arrow);
    if (params === -1) continue;
    const open = bodyStart(code, context, params, arrow);
    if (open === -1) continue;
    const close = matching(code, open);
    if (close !== -1) found.push({ index: match.index, name: match[1]!, open, close });
  }
  return found;
}

/** 파일의 함수들과 그 몸체의 해시. 나온 차례대로다. 언어는 확장자로 정한다. */
export function functionBodies(file: SourceFile): FunctionBody[] {
  const language = languageOf(file.path);
  if (language === null) return [];
  const code = blankCommentsAndStrings(file.source, language);
  const withStrings = blankCommentsAndStrings(file.source, language, "keep");
  const lineOf = lineLocator(code);
  const found =
    language === "rust"
      ? findFunctions(code, null, RUST_FN, false)
      : [...findFunctions(code, withStrings, TS_FUNCTION, false), ...findFunctions(code, withStrings, TS_ARROW, true)];
  found.sort((a, b) => a.index - b.index);
  return found.map(({ index, name, open, close }) => {
    const normalized = withStrings.slice(open + 1, close).replace(/\s+/g, "");
    return {
      file: file.path,
      line: lineOf(index),
      name,
      lines: Math.max(0, lineOf(close) - lineOf(open) - 1),
      hash: createHash("sha1").update(normalized).digest("hex").slice(0, 12),
    };
  });
}

/** 다른 이름으로 같은 몸체를 가진 함수들의 묶음. 안쪽 줄이 `minLines` 보다 짧은 함수는 뺀다. */
export function duplicateBodies(files: SourceFile[], minLines = 11): DuplicateGroup[] {
  const byHash = new Map<string, FunctionBody[]>();
  for (const file of files) {
    for (const body of functionBodies(file)) {
      if (body.lines < minLines) continue;
      const group = byHash.get(body.hash);
      if (group) group.push(body);
      else byHash.set(body.hash, [body]);
    }
  }
  const groups: DuplicateGroup[] = [];
  for (const [hash, bodies] of byHash) {
    if (new Set(bodies.map((body) => body.name)).size < 2) continue;
    groups.push({ hash, functions: bodies.map(({ file, line, name }) => ({ file, line, name })) });
  }
  return groups;
}
