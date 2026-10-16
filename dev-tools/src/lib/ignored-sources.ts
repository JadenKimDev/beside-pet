// 추적되는 소스가 가리키는 파일 가운데 git 이 무시하는 것을 찾는 규칙. 순수 함수만 둔다.
// 파일과 git 에 닿는 부분은 `repo.ts` 에 있다.
//
// 이런 사고를 막는다: `.gitignore` 의 `models/` 가 `apps/api/src/models/index.ts` 를 가려
// 가져오기(`./models`)는 커밋됐는데 가리키는 파일은 커밋에서 빠진다. Rust 의 `mod x;` 도 같이 본다.

import { posix } from "node:path";

/** 검사하는 디렉터리 (레포 루트 기준). */
export const SOURCE_ROOTS = ["apps/", "packages/", "dev-tools/"] as const;

const RUST_EXT = /\.rs$/;
const SCRIPT_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export type SourceKind = "rust" | "script";

export function sourceKind(path: string): SourceKind | null {
  if (!SOURCE_ROOTS.some((root) => path.startsWith(root))) {
    return null;
  }
  if (RUST_EXT.test(path)) {
    return "rust";
  }
  if (SCRIPT_EXT.test(path) && !path.endsWith(".d.ts")) {
    return "script";
  }
  return null;
}

/** 선언만 있는 `mod x;` 의 이름들. 몸이 있는 `mod x { … }` 는 파일을 가리키지 않는다. */
export function rustModNames(text: string): string[] {
  const pattern =
    /^[ \t]*(?:#\[[^\]\n]*\][ \t]*)*(?:pub(?:\([^)\n]*\))?[ \t]+)?mod[ \t]+(?:r#)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*;/gm;
  return [...withoutRustComments(text).matchAll(pattern)].map((m) => m[1] as string);
}

function withoutRustComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `mod name;` 이 `file` 안에 있을 때 가리킬 수 있는 파일들, 찾는 순서대로. */
export function rustModCandidates(file: string, name: string): string[] {
  const dir = posix.dirname(file);
  const base = posix.basename(file, ".rs");
  const parentName = posix.basename(dir);
  const ownsDir =
    base === "main" ||
    base === "lib" ||
    base === "mod" ||
    base === "build" ||
    ["bin", "tests", "benches", "examples"].includes(parentName);
  const moduleDir = ownsDir ? dir : posix.join(dir, base);
  return [posix.join(moduleDir, `${name}.rs`), posix.join(moduleDir, name, "mod.rs")];
}

/** 상대 경로(`./`, `../`)로 가져오는 지정자들. */
export function relativeImports(text: string): string[] {
  const patterns = [
    /\bfrom[ \t\n]*["']([^"'\n]+)["']/g,
    /\bimport[ \t\n]*["']([^"'\n]+)["']/g,
    /\bimport[ \t\n]*\([ \t\n]*["']([^"'\n]+)["'][ \t\n]*\)/g,
    /\brequire[ \t\n]*\([ \t\n]*["']([^"'\n]+)["'][ \t\n]*\)/g,
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1] as string;
      if (spec.startsWith("./") || spec.startsWith("../")) {
        found.add(spec);
      }
    }
  }
  return [...found];
}

const SCRIPT_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];

/** 지정자 `spec` 이 `file` 안에 있을 때 가리킬 수 있는 파일들, 찾는 순서대로. */
export function importCandidates(file: string, spec: string): string[] {
  const bare = spec.replace(/[?#].*$/, "");
  const target = posix.normalize(posix.join(posix.dirname(file), bare));
  const candidates = [target];
  // NodeNext 식으로 `.js` 라고 적고 `.ts` 를 가리키는 경우.
  const jsLike = /\.(m|c)?jsx?$/.exec(target);
  if (jsLike) {
    const stem = target.slice(0, -jsLike[0].length);
    const mid = jsLike[1] ?? "";
    candidates.push(`${stem}.${mid}ts`, `${stem}.${mid}tsx`);
  }
  for (const ext of SCRIPT_EXTS) {
    candidates.push(`${target}${ext}`);
  }
  for (const ext of SCRIPT_EXTS) {
    candidates.push(posix.join(target, `index${ext}`));
  }
  return candidates;
}

export type Pointer = { from: string; to: string };

/**
 * 소스 하나가 가리키는 파일들. 후보 가운데 처음으로 있는 파일을 고른다.
 * 어느 후보도 없으면 건너뛴다 (빌드가 따로 잡는다).
 */
export function pointers(file: string, text: string, isFile: (path: string) => boolean): Pointer[] {
  const kind = sourceKind(file);
  const lists =
    kind === "rust"
      ? rustModNames(text).map((name) => rustModCandidates(file, name))
      : kind === "script"
        ? relativeImports(text).map((spec) => importCandidates(file, spec))
        : [];
  const out: Pointer[] = [];
  for (const candidates of lists) {
    const to = candidates.find(isFile);
    if (to !== undefined && to !== file) {
      out.push({ from: file, to });
    }
  }
  return out;
}

/** 가리킨 파일 가운데 무시되는 것을 사람이 읽을 줄로. 없으면 빈 배열. */
export function ignoredPointerLines(found: Pointer[], ignored: Set<string>): string[] {
  return found
    .filter((p) => ignored.has(p.to))
    .map((p) => `${p.to}  (가리키는 곳: ${p.from})`)
    .sort();
}
