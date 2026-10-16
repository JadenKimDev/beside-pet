// 레포 규칙: 대화 웹(`apps/web`)의 색은 디자인 토큰으로만, 사용자에게 보이는 글자는 i18n 사전에만 둔다.
//
// - 색 리터럴: `apps/web` 의 `.ts`·`.tsx` 에서 hex 색(`#fff`, `#ffffff80` 처럼 3, 4, 6, 8자리)과 `rgb(`·`rgba(`·
//   `hsl(`·`hsla(` 를 쓰지 않는다. 토큰은 `app/globals.css`(`.css` 라 검사 밖)에 두고, 테마 기구인 `theme/` 아래와
//   테스트 파일은 예외다.
// - 한글 리터럴: `apps/web` 의 `.tsx` 에서 한글 글자를 쓰지 않는다. 사전인 `i18n/` 아래와 테스트 파일은 예외다.
//
// 주석은 보지 않는다(`// #12` 같은 이슈 번호, 설명 글). 문자열과 JSX 글은 본다. hex 는 앞 글자가 따옴표, 빈칸,
// `[`, `(`, `:`, `,`, `=` 이거나 줄의 시작일 때만 잡아 URL 앵커(`/a#top`)와 HTML 글자 참조(`&#123;`)를 거른다.
// 뒤에는 글자나 숫자가 오지 않아야 한다. 같은 줄은 규칙마다 한 번만 돌려준다. 경로는 레포 루트 기준이다.

import { isTestPath } from "./large-files.ts";
import { blankCommentsAndStrings, languageOf, type SourceFile } from "./source-text.ts";

export type WebLiteralUse = { file: string; line: number; text: string; rule: string };

const WEB = "apps/web/";
const COLOR_EXEMPT = ["apps/web/theme/"];
const HANGUL_EXEMPT = ["apps/web/i18n/"];

/** 색 리터럴 규칙이 보는 파일인가: `apps/web` 의 TS 이고, `theme/` 아래도 테스트도 아니다. */
export function inColorLiteralScope(path: string): boolean {
  if (!path.startsWith(WEB) || languageOf(path) !== "ts" || path.endsWith(".d.ts")) return false;
  return !isTestPath(path) && !COLOR_EXEMPT.some((dir) => path.startsWith(dir));
}

/** 한글 리터럴 규칙이 보는 파일인가: `apps/web` 의 `.tsx` 이고, `i18n/` 아래도 테스트도 아니다. */
export function inHangulLiteralScope(path: string): boolean {
  if (!path.startsWith(WEB) || !path.endsWith(".tsx")) return false;
  return !isTestPath(path) && !HANGUL_EXEMPT.some((dir) => path.startsWith(dir));
}

const HEX_COLOR = /(?:^|["'`\s[(:,=])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/i;
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?)\(/i;
/** 한글 음절, 자모, 호환 자모. */
const HANGUL = /[ᄀ-ᇿㄱ-ㆎ가-힣]/;

type Check = { pattern: RegExp; rule: string };

const COLOR_CHECKS: Check[] = [
  { pattern: HEX_COLOR, rule: "hex 색 리터럴 대신 디자인 토큰을 쓴다" },
  { pattern: COLOR_FUNCTION, rule: "rgb()·hsl() 대신 디자인 토큰을 쓴다" },
];
const HANGUL_CHECKS: Check[] = [{ pattern: HANGUL, rule: "한글 글자는 i18n 사전에 두고 키로 부른다" }];

/** 주석만 지운 글에서 `checks` 에 걸린 줄들. */
function scan(file: SourceFile, checks: Check[]): WebLiteralUse[] {
  const original = file.source.split("\n");
  const code = blankCommentsAndStrings(file.source, "ts", "keep").split("\n");
  const found: WebLiteralUse[] = [];
  code.forEach((line, index) => {
    for (const { pattern, rule } of checks) {
      if (pattern.test(line)) found.push({ file: file.path, line: index + 1, text: original[index]!.trim(), rule });
    }
  });
  return found;
}

/** 파일에서 색 리터럴을 쓴 줄들. 규칙이 보지 않는 파일이면 빈 목록이다. */
export function colorLiteralViolations(file: SourceFile): WebLiteralUse[] {
  return inColorLiteralScope(file.path) ? scan(file, COLOR_CHECKS) : [];
}

/** 파일에서 한글 글자를 쓴 줄들. 규칙이 보지 않는 파일이면 빈 목록이다. */
export function hangulLiteralViolations(file: SourceFile): WebLiteralUse[] {
  return inHangulLiteralScope(file.path) ? scan(file, HANGUL_CHECKS) : [];
}
