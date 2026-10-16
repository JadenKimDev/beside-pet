// 레포의 `CLAUDE.md` 들이 가리키는 레포 경로를 뽑는 규칙. 순수 함수만 둔다.
// 파일과 git 에 닿는 부분은 `repo.ts` 에 있고, 레포 전체의 검사는 `../claude-md-paths.test.ts` 다.

/** 검사하는 문서인가: git 이 추적하는 `CLAUDE.md`(루트와 영역마다의 것). */
export function isClaudeMd(path: string): boolean {
  return path === "CLAUDE.md" || path.endsWith("/CLAUDE.md");
}

/** 이 접두사로 시작하는 백틱 안의 글만 레포 경로로 본다. */
export const PATH_PREFIXES = ["apps/", "packages/", "dev-tools/", ".claude/", "docs/", "infra/"] as const;

/** 자리 표시나 문장이 섞인 백틱 (`docs/prd/<파일>.md`, `apps/{api,web}/…`). */
const PLACEHOLDER = /[\s<>{}*|()…]/;

export interface PathRef {
  /** 문서 (레포 루트 기준). */
  doc: string;
  /** 1부터 세는 줄 번호. */
  line: number;
  path: string;
}

/** 문서에서 백틱으로 감싼 레포 경로를 줄 번호와 함께 뽑는다. 울타리 코드 블록은 건너뛴다. */
export function backtickPaths(doc: string, text: string): PathRef[] {
  const refs: PathRef[] = [];
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) {
      return;
    }
    for (const match of raw.matchAll(/`([^`\n]+)`/g)) {
      const path = match[1]!;
      if (!PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) || PLACEHOLDER.test(path)) {
        continue;
      }
      refs.push({ doc, line: index + 1, path });
    }
  });
  return refs;
}

export interface Excluded {
  /** 상태가 "계획"인 줄의 경로: 아직 없다. */
  planned: string[];
  /** 상태가 "로컬"인 줄의 경로: gitignore 라 체크아웃에 없을 수 있다. */
  local: string[];
}

/** 루트 `CLAUDE.md` 의 "## 구조" 표에서 상태 칸으로 검사에서 뺄 경로를 고른다. */
export function excludedFromStructure(text: string): Excluded {
  const excluded: Excluded = { planned: [], local: [] };
  let inSection = false;
  for (const line of text.split("\n")) {
    if (/^##\s/.test(line)) {
      inSection = /^##\s+구조\s*$/.test(line);
      continue;
    }
    if (!inSection || !line.trim().startsWith("|")) {
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) {
      continue;
    }
    const status = cells[cells.length - 1]!;
    const paths = [...cells[0]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    if (status === "계획") {
      excluded.planned.push(...paths);
    } else if (status.startsWith("로컬")) {
      excluded.local.push(...paths);
    }
  }
  return excluded;
}

/** `path` 가 제외 목록의 경로이거나 그 아래에 있는가. 끝의 `/` 는 따지지 않는다. */
export function isUnder(path: string, roots: readonly string[]): boolean {
  const bare = (p: string): string => p.replace(/\/+$/, "");
  return roots.some((root) => bare(path) === bare(root) || bare(path).startsWith(`${bare(root)}/`));
}

/**
 * `path` 가 계획된 자리인가: 계획 경로이거나 그 아래, 또는 계획 경로를 품는 위 디렉터리
 * (`apps/api/` 가 계획이면 `apps/` 도 아직 없을 수 있다).
 */
export function isPlanned(path: string, planned: readonly string[]): boolean {
  return isUnder(path, planned) || planned.some((root) => isUnder(root, [path]));
}

/** 없는 경로를 "`CLAUDE.md:97` → `apps/foo/` 없음" 꼴로 적는다. */
export function missingLines(refs: readonly PathRef[]): string[] {
  return refs.map((ref) => `\`${ref.doc}:${ref.line}\` → \`${ref.path}\` 없음`);
}
