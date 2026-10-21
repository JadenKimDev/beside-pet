// 운영 화면(`apps/backoffice`)의 Feature-Sliced Design 규칙. 레이어는 위에서부터 `app > views > widgets > features >
// entities > shared` 이다.
//
// 1. 레이어 방향: 위가 아래만 가져온다. `entities` 가 `features` 를 가져오면 어김이다.
// 2. 같은 레이어 교차: 슬라이스가 있는 레이어(`views`, `widgets`, `features`, `entities`)에서 슬라이스끼리 가져오지
//    않는다. `app` 과 `shared` 는 슬라이스 없이 세그먼트로 가르는 레이어라 세그먼트끼리 가져와도 된다.
// 3. 공개 API: 단위(슬라이스, 또는 `app`·`shared` 의 세그먼트) 밖에서는 그 단위의 `index` 만 가져온다.
//    `@/entities/account` 는 되고 `@/entities/account/model/types` 와 `@/shared/api/client` 는 안 된다. 같은 단위
//    안에서는 어느 경로든 된다. 스타일과 그림 같은 모듈이 아닌 파일(`@/app/styles/globals.css`)은 공개 API 규칙에서
//    뺀다(방향 규칙은 본다).
//
// 경로는 `apps/backoffice` 기준이다(`src/entities/account/index.ts`, `app/page.tsx`). 별칭 `@/` 는 `src/` 를 가리킨다.
// 가져오기는 별칭과 상대 경로를 둘 다 풀어서 같은 규칙을 들이댄다. Next 의 라우트 파일(`app/` 아래)은 레이어 `app`
// 과 같게 본다. `src/` 밖을 가리키는 가져오기(패키지, 라우트끼리의 상대 경로)와 테스트 파일은 보지 않는다.
// 한 가져오기에는 방향, 교차, 공개 API 차례로 처음 어긴 규칙 하나만 돌려준다.

import { posix } from "node:path";

import { isTestPath } from "./large-files.ts";
import { blankCommentsAndStrings, languageOf, lineLocator, type SourceFile } from "./source-text.ts";

/** 위에서 아래로의 레이어 차례. */
export const FSD_LAYERS: readonly string[] = ["app", "views", "widgets", "features", "entities", "shared"];
/** 슬라이스 없이 세그먼트로 가르는 레이어. 같은 레이어 교차 규칙의 예외다. */
const UNSLICED: readonly string[] = ["app", "shared"];

/** 어긴 가져오기 하나. `specifier` 는 소스에 쓴 그대로의 경로다. */
export type FsdViolation = { file: string; line: number; specifier: string; rule: string };

/** 파일이나 가져온 대상이 놓인 자리. `unit` 은 슬라이스나 세그먼트(`entities/account`, `shared/api`)다. */
type Place = { layer: string; unit: string | null; rest: string[] };

const SRC = "src/";
const ROUTES = "app/";
const NON_MODULE = /\.(?:css|scss|sass|svg|png|jpe?g|gif|webp|ico|json)$/;

/** `src/` 기준 경로 조각에서 자리. 레이어 밖이면 `null`. */
function placeOf(parts: string[]): Place | null {
  const layer = parts[0];
  if (layer === undefined || !FSD_LAYERS.includes(layer)) return null;
  const name = parts[1];
  const unit = name === undefined || name === "" ? null : `${layer}/${name.replace(/\.tsx?$/, "")}`;
  return { layer, unit, rest: parts.slice(2) };
}

/** 검사하는 파일의 자리. 라우트 파일은 단위 없는 레이어 `app` 이다. */
function filePlaceOf(path: string): Place | null {
  if (path.startsWith(SRC)) return placeOf(path.slice(SRC.length).split("/"));
  if (path.startsWith(ROUTES)) return { layer: "app", unit: null, rest: [] };
  return null;
}

/** 가져온 경로를 `src/` 기준 조각으로 푼다. `src/` 밖이면 `null`. */
function resolveTarget(file: string, specifier: string): string[] | null {
  let path: string;
  if (specifier.startsWith("@/")) path = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    path = posix.normalize(posix.join(posix.dirname(file), specifier));
  } else return null;
  if (!path.startsWith(SRC)) return null;
  return path.slice(SRC.length).replace(/\/$/, "").split("/");
}

/** 단위 밖에서 가져와도 되는 나머지 경로인가: 없거나 `index` 뿐이다. */
function isPublicEntry(rest: string[]): boolean {
  return rest.length === 0 || (rest.length === 1 && /^index(?:\.tsx?)?$/.test(rest[0]!));
}

/** 한 가져오기가 처음 어긴 규칙의 문구. 어기지 않았으면 `null`. */
function brokenRule(from: Place, to: Place, specifier: string): string | null {
  const fromRank = FSD_LAYERS.indexOf(from.layer);
  const toRank = FSD_LAYERS.indexOf(to.layer);
  if (toRank < fromRank) {
    return `${from.layer} 레이어는 위 레이어 ${to.layer} 를 가져오지 않는다(위가 아래만 가져온다)`;
  }
  const sameUnit = from.unit !== null && from.unit === to.unit;
  if (sameUnit) return null;
  if (toRank === fromRank && !UNSLICED.includes(from.layer) && from.unit !== null && to.unit !== null) {
    return `${from.unit} 는 같은 레이어의 슬라이스 ${to.unit} 를 가져오지 않는다`;
  }
  if (to.unit === null || NON_MODULE.test(specifier) || isPublicEntry(to.rest)) return null;
  return `${to.unit} 밖에서는 ${to.unit} 의 index 만 가져온다(@/${to.unit})`;
}

const STATIC_IMPORT = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\bfrom\s*)?(["'])([^"'\n]+)\1/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;

/** 소스에서 가져오기 경로와 그 줄. 주석 안과 문자열 안의 글은 보지 않는다. */
export function importSpecifiers(source: string): { specifier: string; line: number }[] {
  const withStrings = blankCommentsAndStrings(source, "ts", "keep");
  const codeOnly = blankCommentsAndStrings(source, "ts");
  const lineOf = lineLocator(source);
  const found: { specifier: string; line: number; index: number }[] = [];
  for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of withStrings.matchAll(pattern)) {
      // 키워드가 문자열 안에 있으면 코드만 남긴 글에서는 빈칸이다.
      if (!/^(?:import|export)/.test(codeOnly.slice(match.index))) continue;
      const index = match.index + match[0].lastIndexOf(match[2]!);
      found.push({ specifier: match[2]!, line: lineOf(index), index });
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ specifier, line }) => ({ specifier, line }));
}

/** 규칙이 보는 파일인가: `src/` 의 레이어 아래나 라우트 자리의 TS 이고, 테스트도 선언 파일도 아니다. */
export function inFsdScope(path: string): boolean {
  if (languageOf(path) !== "ts" || path.endsWith(".d.ts") || isTestPath(path)) return false;
  return filePlaceOf(path) !== null;
}

/** FSD 규칙을 어긴 가져오기들. 경로는 `apps/backoffice` 기준으로 받고 돌려준다. 파일 차례, 파일 안에서는 줄 차례다. */
export function fsdLayerViolations(files: SourceFile[]): FsdViolation[] {
  const found: FsdViolation[] = [];
  for (const file of files) {
    if (!inFsdScope(file.path)) continue;
    const from = filePlaceOf(file.path)!;
    for (const { specifier, line } of importSpecifiers(file.source)) {
      const parts = resolveTarget(file.path, specifier);
      const to = parts === null ? null : placeOf(parts);
      if (to === null) continue;
      const rule = brokenRule(from, to, specifier);
      if (rule !== null) found.push({ file: file.path, line, specifier, rule });
    }
  }
  return found;
}
