// Rust 서버 규칙: 다른 기능이 쓸 수 있는 것은 그 기능 `mod.rs` 의 `pub` 뿐이다. `crate::<기능>::<내부 모듈>::…`
// 경로를 그 기능 밖에서 쓰면 어김이다. 하위 기능(`<기능>/<이름>/mod.rs`)도 같아서, 하위 기능의 내부 모듈은
// 하위 기능 밖에서 쓰지 않는다. `app.rs`, `main.rs` 처럼 기능 밖의 파일에는 모든 기능의 내부 경로가 어김이다.
//
// 경로는 서버 크레이트의 `src` 기준(`support/sessions.rs`)이다. 경로 목록에서 모듈(`x.rs`, `x/mod.rs`)과
// 단위(기능과 하위 기능, 곧 `mod.rs` 를 가진 맨 위 디렉터리와 그 바로 아래 디렉터리)를 정하고, 경로의 다음 마디가
// 모듈이면 내부 경로로 본다. 그래서 기능의 `mod.rs` 가 내보낸 항목(`crate::identity::Account`)은 걸리지 않는다.
// `app` 은 조립 자리이지 기능이 아니다(`app.rs` 와 `app/`). `use` 문(중괄호를 풀어서)과 코드 안에 직접 쓴
// `crate::…` 경로를 둘 다 본다. 주석과 문자열 안은 보지 않는다.

import { blankCommentsAndStrings, blankKeepingLines, lineLocator, type SourceFile } from "./source-text.ts";

export type RustFile = SourceFile;
/** 어긴 경로 하나. `owner` 는 내부를 들킨 단위(`account`, `introduction/affinity`). */
export type InternalUse = { file: string; line: number; usePath: string; owner: string; rule: string };

/** `a/b/c.rs` → `a::b::c`, `a/b/mod.rs` → `a::b`. `.rs` 가 아니면 `null`. */
function modulePath(path: string): string | null {
  if (!path.endsWith(".rs")) return null;
  const parts = path.slice(0, -3).split("/");
  if (parts.at(-1) === "mod") parts.pop();
  return parts.join("::");
}

/** 기능이 아닌 맨 위 이름. 조립 자리(`app.rs` 와 `app/`)다. */
export const NON_FEATURE_ROOTS: readonly string[] = ["app"];

/** 기능과 하위 기능의 디렉터리(`src` 기준, `/` 로 잇는다): `<기능>/mod.rs` 와, 기능 아래의 `<기능>/<이름>/mod.rs`. */
export function featureDirs(paths: string[]): Set<string> {
  const files = new Set(paths);
  const dirs = new Set<string>();
  for (const path of files) {
    const parts = path.split("/");
    if (parts.at(-1) !== "mod.rs" || NON_FEATURE_ROOTS.includes(parts[0]!)) continue;
    if (parts.length === 2) dirs.add(parts[0]!);
    if (parts.length === 3 && files.has(`${parts[0]}/mod.rs`)) dirs.add(`${parts[0]}/${parts[1]}`);
  }
  return dirs;
}

type Layout = { modules: Set<string>; units: Set<string> };

function layout(paths: string[]): Layout {
  const modules = new Set<string>();
  for (const path of paths) {
    const module = modulePath(path);
    if (module) modules.add(module);
  }
  const units = new Set([...featureDirs(paths)].map((dir) => dir.replaceAll("/", "::")));
  return { modules, units };
}

/** `use` 의 나무 글(`a::{b, c::{d as e, self}}`)을 낱낱의 경로로 푼다. `self` 는 앞 경로, `as` 별칭은 뗀다. */
export function expandUseTree(tree: string): string[] {
  const text = tree.replace(/\s+as\s+\w+/g, "").replace(/\s+/g, "");
  const found: string[] = [];
  const walk = (prefix: string, part: string) => {
    const open = part.indexOf("{");
    if (open === -1) {
      if (part === "self") found.push(prefix.replace(/::$/, ""));
      else if (part !== "") found.push(prefix + part);
      return;
    }
    const head = prefix + part.slice(0, open);
    const inner = part.slice(open + 1, part.lastIndexOf("}"));
    let depth = 0;
    let start = 0;
    for (let i = 0; i <= inner.length; i += 1) {
      const ch = inner[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if ((ch === "," && depth === 0) || i === inner.length) {
        walk(head, inner.slice(start, i));
        start = i + 1;
      }
    }
  };
  walk("", text);
  return found;
}

/** 파일 `fileModule` 이 `crate::…` 경로 `segments` 를 쓸 때 어긴 단위. 바깥 단위부터 보고 처음 것 하나다. */
function brokenUnit(fileModule: string, segments: string[], { modules, units }: Layout): string | null {
  for (let i = 1; i < segments.length; i += 1) {
    const unit = segments.slice(0, i).join("::");
    if (!units.has(unit)) continue;
    if (!modules.has(`${unit}::${segments[i]}`)) return null;
    const inside = fileModule === unit || fileModule.startsWith(`${unit}::`);
    if (!inside) return unit;
  }
  return null;
}

const USE = /\b(?:pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/g;
const CRATE_PATH = /(?<![$\w])crate((?:::\w+)+)/g;

/** 기능 밖에서 기능의 내부 모듈을 쓴 자리들. 파일 차례, 파일 안에서는 `use` 문이 먼저고 그다음 코드의 경로다. */
export function internalUseViolations(
  files: RustFile[],
  paths: string[] = files.map((file) => file.path),
): InternalUse[] {
  const shape = layout(paths);
  const found: InternalUse[] = [];
  for (const file of files) {
    const fileModule = modulePath(file.path);
    if (fileModule === null) continue;
    let code = blankCommentsAndStrings(file.source, "rust");
    const lineOf = lineLocator(code);
    const seen = new Set<string>();
    const report = (usePath: string, index: number) => {
      if (!usePath.startsWith("crate::")) return;
      const owner = brokenUnit(fileModule, usePath.split("::").slice(1), shape);
      if (owner === null) return;
      const line = lineOf(index);
      const key = `${line} ${usePath}`;
      if (seen.has(key)) return;
      seen.add(key);
      const name = owner.replaceAll("::", "/");
      found.push({
        file: file.path,
        line,
        usePath,
        owner: name,
        rule: `${name} 의 내부 모듈은 ${name} 밖에서 쓰지 않는다(그 mod.rs 의 pub 만 쓴다)`,
      });
    };
    for (const match of code.matchAll(USE)) {
      for (const usePath of expandUseTree(match[1]!)) report(usePath, match.index);
    }
    code = code.replace(USE, blankKeepingLines);
    for (const match of code.matchAll(CRATE_PATH)) report(`crate${match[1]}`, match.index);
  }
  return found;
}
