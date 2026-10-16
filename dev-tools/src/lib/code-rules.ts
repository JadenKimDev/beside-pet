// 레포 검사(`../code-rules.test.ts`)가 `@beside-pet/dev-checks/code-rules` 의 규칙을 부르는 조립. 순수 함수만 둔다.
// 경로는 레포 루트 기준으로 받고 돌려준다. Rust 서버 규칙은 `apps/server/src` 기준 경로로 바꿔 돌린 뒤 되돌린다.
// 파일을 읽는 부분은 `repo.ts` 의 `readTrackedSources` 다.
// 검사하는 소스 자리는 `project.config.json` 의 `codeRoots` 다.

import {
  colorLiteralViolations,
  duplicateBodies,
  genericTypeViolations,
  hangulLiteralViolations,
  internalUseViolations,
  isTestPath,
  languageOf,
  largeFiles,
  modPlacementViolations,
  type SourceFile,
} from "@beside-pet/dev-checks/code-rules";

import { DEFAULT_CODE_ROOTS } from "./config.ts";

/** Rust 서버 크레이트의 소스 뿌리(레포 루트 기준). 기능 내부 경로와 `mod.rs` 자리 규칙은 이 아래만 본다. */
export const SERVER_SRC = "apps/server/src/";

/** 발견 하나. `line` 이 없으면 파일 전체에 대한 것이다. */
export type Finding = { file: string; line?: number; note: string };

/**
 * 검사할 소스 파일인가: `roots` 아래의 코드 파일이고, 선언 파일(`.d.ts`)도 생성된 파일(`generated/` 아래)도 아니다.
 * 생성된 파일은 손으로 고치지 않으므로 규칙을 들이대지 않는다.
 */
export function isCodeFile(path: string, roots: readonly string[] = DEFAULT_CODE_ROOTS): boolean {
  if (!roots.some((root) => path.startsWith(root))) return false;
  if (path.endsWith(".d.ts")) return false;
  if (/(^|\/)generated\//.test(path)) return false;
  return languageOf(path) !== null;
}

function inServer(path: string): boolean {
  return path.startsWith(SERVER_SRC) && path.endsWith(".rs");
}

function serverRelative(path: string): string {
  return path.slice(SERVER_SRC.length);
}

/**
 * 기능 밖에서 기능의 내부 모듈 경로를 쓴 자리. 서버 src 아래의 `.rs` 만 본다.
 * 테스트 파일은 검사하지 않지만 모듈 모양(어떤 경로가 모듈인가)에는 넣는다.
 */
export function internalUseFindings(files: SourceFile[]): Finding[] {
  const server = files.filter((file) => inServer(file.path));
  const paths = server.map((file) => serverRelative(file.path));
  const checked = server
    .map((file) => ({ path: serverRelative(file.path), source: file.source }))
    .filter((file) => !isTestPath(file.path));
  return internalUseViolations(checked, paths).map((v) => ({
    file: SERVER_SRC + v.file,
    line: v.line,
    note: `${v.usePath}: ${v.rule}`,
  }));
}

/** `mod.rs` 의 자리. 받은 경로 가운데 서버 src 아래의 `.rs` 만 본다. */
export function modPlacementFindings(paths: readonly string[]): Finding[] {
  const server = paths.filter(inServer).map(serverRelative);
  return modPlacementViolations(server).map((v) => ({ file: SERVER_SRC + v.path, note: v.rule }));
}

function lineCount(source: string): number {
  if (source === "") return 0;
  const lines = source.split("\n").length;
  return source.endsWith("\n") ? lines - 1 : lines;
}

/** 600줄을 넘는 제품 파일. */
export function largeFileFindings(files: SourceFile[]): Finding[] {
  const lengths = files.map((file) => ({ path: file.path, lines: lineCount(file.source) }));
  return largeFiles(lengths).map((file) => ({ file: file.path, note: `${file.lines}줄` }));
}

/** 다른 이름의 같은 몸체 함수 묶음 수와, 묶음마다 머리 한 줄과 위치들. */
export function duplicateBodyReport(files: SourceFile[]): { groups: number; lines: string[] } {
  const groups = duplicateBodies(files);
  const lines: string[] = [];
  groups.forEach((group, index) => {
    lines.push(`묶음 ${index + 1} (${group.hash})`);
    for (const fn of group.functions) lines.push(`  ${findingLine({ file: fn.file, line: fn.line, note: fn.name })}`);
  });
  return { groups: groups.length, lines };
}

/** 범용 타입을 쓴 줄. */
export function genericTypeFindings(files: SourceFile[]): Finding[] {
  return files.flatMap((file) =>
    genericTypeViolations(file).map((v) => ({ file: v.file, line: v.line, note: `${v.rule}: ${v.text}` })),
  );
}

/** 대화 웹에서 hex 색과 `rgb()`·`hsl()` 을 쓴 줄. `theme/` 아래와 테스트는 규칙이 뺀다. */
export function colorLiteralFindings(files: SourceFile[]): Finding[] {
  return files.flatMap((file) =>
    colorLiteralViolations(file).map((v) => ({ file: v.file, line: v.line, note: `${v.rule}: ${v.text}` })),
  );
}

/** 대화 웹의 `.tsx` 에서 한글 글자를 쓴 줄. `i18n/` 아래와 테스트는 규칙이 뺀다. */
export function hangulLiteralFindings(files: SourceFile[]): Finding[] {
  return files.flatMap((file) =>
    hangulLiteralViolations(file).map((v) => ({ file: v.file, line: v.line, note: `${v.rule}: ${v.text}` })),
  );
}

/** `파일:줄  설명`, 줄이 없으면 `파일  설명`. */
export function findingLine(finding: Finding): string {
  const at = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return `${at}  ${finding.note}`;
}

/** 머리에 건수를 둔 출력. */
export function report(title: string, count: number, lines: string[]): string {
  return [`${title}: ${count}건`, ...lines].join("\n");
}
