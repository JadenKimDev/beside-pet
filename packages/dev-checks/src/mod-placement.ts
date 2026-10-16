// Rust 서버 규칙: 모듈 파일은 `x.rs` 이고 하위 모듈과 테스트는 `x/` 에 둔다. `mod.rs` 는 기능(`<기능>/mod.rs`)과
// 하위 기능(`<기능>/<이름>/mod.rs`, 그 `<기능>` 도 `mod.rs` 를 가진 기능)의 뿌리에만 둔다. 그 밖의 디렉터리 `x/` 는
// 곁에 `x.rs` 가 있어야 한다. `app` 은 기능이 아니므로 `app/mod.rs` 대신 `app.rs` 를 둔다.
//
// 테스트 곁 디렉터리 `tests/` 는 예외다. `x/tests.rs` 가 가리키든 `x/tests/mod.rs` 로 열든 허용하고, 그
// 아래는 보지 않는다. 경로는 서버 크레이트의 `src` 기준이고 `.rs` 만 본다.

import { NON_FEATURE_ROOTS } from "./internal-use.ts";

export type ModPlacementViolation = { path: string; rule: string };

function inTestsDir(parts: string[]): boolean {
  return parts.slice(0, -1).includes("tests");
}

/** 기능이나 하위 기능의 뿌리 `mod.rs` 인가. */
function isRootMod(parts: string[], files: Set<string>): boolean {
  if (NON_FEATURE_ROOTS.includes(parts[0]!)) return false;
  if (parts.length === 2) return true;
  return parts.length === 3 && files.has(`${parts[0]}/mod.rs`);
}

/** `mod.rs` 가 놓이면 안 되는 자리와, `mod.rs` 도 곁의 `x.rs` 도 없는 디렉터리. 경로 차례대로다. */
export function modPlacementViolations(paths: string[]): ModPlacementViolation[] {
  const files = new Set(paths.filter((path) => path.endsWith(".rs")));
  const found: ModPlacementViolation[] = [];
  const dirs = new Set<string>();
  for (const path of files) {
    const parts = path.split("/");
    if (inTestsDir(parts)) continue;
    if (parts.at(-1) === "mod.rs" && !isRootMod(parts, files)) {
      const dir = parts.slice(0, -1).join("/");
      const move = dir === "" ? "" : `. ${dir}.rs 로 옮긴다`;
      found.push({
        path,
        rule: `mod.rs 는 기능(<기능>/mod.rs)과 하위 기능(<기능>/<이름>/mod.rs)의 뿌리에만 둔다${move}`,
      });
    }
    for (let depth = 1; depth < parts.length; depth += 1) {
      dirs.add(parts.slice(0, depth).join("/"));
    }
  }
  for (const dir of dirs) {
    if (files.has(`${dir}/mod.rs`) || files.has(`${dir}.rs`)) continue;
    found.push({ path: dir, rule: `디렉터리 ${dir}/ 곁에 ${dir}.rs 를 둔다(mod.rs 는 기능과 하위 기능의 뿌리에만)` });
  }
  return found;
}
