// 작업 범위에서 검증 명령을 끌어낸다. 러너는 이 명령의 종료 코드만으로 판정한다.
//
// 범위가 어느 패키지에도 속하지 않으면(문서, 설정) 명령을 지어내지 않는다. 그런 작업은
// PRD 표의 `검증` 칸에 명령을 직접 적거나, 사람이 정할 때까지 `needs_spec` 으로 남는다.

export interface NodePackage {
  name: string;
  scripts: string[];
}

/** 레포의 현재 모습을 묻는 창구. 테스트에서는 가짜로 바꿔 끼운다. */
export interface RepoProbe {
  /** 그 디렉터리에 `package.json` 이 있으면 이름과 스크립트 목록. */
  nodePackage(dir: string): NodePackage | null;
}

/** 범위 경로가 속한 패키지 디렉터리. 패키지 밖이면 `null`. */
export function unitDir(path: string): string | null {
  const clean = path.replace(/^\.\//, "");
  const nested = /^(apps|packages)\/[^/]+/.exec(clean);
  if (nested) {
    return nested[0];
  }
  if (clean === "dev-tools" || clean.startsWith("dev-tools/")) {
    return "dev-tools";
  }
  return null;
}

/**
 * 범위가 테스트를 먼저 쓰는 영역에 닿는가. PRD 표의 `TDD` 칸이 비어 있을 때의 기본값이다.
 * 영역은 `project.config.json` 의 `tddAreas` 다(제품 코드. 인프라, 도구, 문서는 넣지 않는다).
 */
export function wantsTdd(scope: string[], areas: readonly string[]): boolean {
  const bare = (p: string): string => p.replace(/^\.\//, "").replace(/\/+$/, "");
  return scope.some((path) => {
    const clean = bare(path);
    return areas.map(bare).some((area) => clean === area || clean.startsWith(`${area}/`));
  });
}

export function deriveVerify(scope: string[], probe: RepoProbe): string[] {
  const actions: string[] = [];
  const add = (command: string) => {
    if (!actions.includes(command)) {
      actions.push(command);
    }
  };

  for (const path of scope) {
    const dir = unitDir(path);
    if (!dir) {
      continue;
    }
    const node = probe.nodePackage(dir);
    if (node) {
      if (node.scripts.includes("typecheck")) {
        add(`pnpm -F ${node.name} typecheck`);
      }
      if (node.scripts.includes("test")) {
        add(`pnpm -F ${node.name} test`);
      }
      continue;
    }
    // 이 작업이 새로 만들 패키지다. 아직 이름을 알 수 없으므로 넓게 건다.
    add("pnpm test");
  }
  return actions;
}
