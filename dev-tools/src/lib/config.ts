// 레포 루트의 `project.config.json` 을 읽는 규칙. 순수 함수만 둔다. 파일을 읽는 부분은 `repo.ts` 의 `readConfig` 다.
//
// 이 파일은 고객 프로젝트마다 다른 값(이름, GitHub 레포, gh 계정, 보드 번호, 테스트를 먼저 쓰는 영역, 검사할 소스 자리)을
// 한 곳에 모은다. `new-client.sh` 가 처음 값을 채우고, 스택이 정해지면 사람이 고친다.

export interface ProjectConfig {
  /** 프로젝트 이름(슬러그). 워크트리 경로에 쓴다. */
  name: string;
  /** GitHub 레포 `owner/name`. 없으면 `origin` 원격에서 읽는다. */
  repo: string | null;
  /** `gh` 를 부를 계정. 없으면 레포 소유 계정, 그 토큰도 없으면 머신의 활성 계정이다. */
  ghUser: string | null;
  /** GitHub 프로젝트 보드 번호. 없으면 보드를 건너뛴다. */
  boardNumber: number | null;
  /** 테스트를 먼저 쓰는 영역(레포 루트 기준 디렉터리). PRD 표의 `TDD` 칸이 비었을 때의 기본값을 정한다. */
  tddAreas: string[];
  /** 레포 검사(큰 파일, 같은 몸체 함수, 범용 타입)가 읽는 소스 자리(레포 루트 기준 접두사). */
  codeRoots: string[];
}

export const CONFIG_FILE = "project.config.json";

/** 스택이 정해지기 전의 기본값. 제품 코드는 `apps/` 아래에 둔다고 본다. */
export const DEFAULT_TDD_AREAS = ["apps"] as const;
export const DEFAULT_CODE_ROOTS = ["apps/", "packages/", "dev-tools/src/"] as const;

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function optionalString(data: JsonObject, key: string): string | null {
  const value = data[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${CONFIG_FILE}: ${key} 는 문자열입니다`);
  return value;
}

function stringList(data: JsonObject, key: string, fallback: readonly string[]): string[] {
  const value = data[key];
  if (value === undefined || value === null) return [...fallback];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item !== "")) {
    throw new Error(`${CONFIG_FILE}: ${key} 는 빈 칸 없는 문자열 배열입니다`);
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** 설정 글을 읽어 빈 칸을 기본값으로 채운다. 모양이 틀리면 어느 칸인지 말하며 던진다. */
export function parseConfig(text: string): ProjectConfig {
  const raw = JSON.parse(text) as Json;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${CONFIG_FILE}: 객체가 아닙니다`);
  }
  const name = optionalString(raw, "name");
  if (name === null) throw new Error(`${CONFIG_FILE}: name 이 없습니다`);
  const repo = optionalString(raw, "repo");
  if (repo !== null && !REPO.test(repo)) throw new Error(`${CONFIG_FILE}: repo 는 owner/name 꼴입니다: ${repo}`);
  const board = raw.boardNumber ?? null;
  let boardNumber: number | null = null;
  if (board !== null) {
    if (typeof board !== "number" || !Number.isInteger(board) || board <= 0) {
      throw new Error(`${CONFIG_FILE}: boardNumber 는 양의 정수이거나 null 입니다`);
    }
    boardNumber = board;
  }
  return {
    name,
    repo,
    ghUser: optionalString(raw, "ghUser"),
    boardNumber,
    tddAreas: stringList(raw, "tddAreas", DEFAULT_TDD_AREAS),
    codeRoots: stringList(raw, "codeRoots", DEFAULT_CODE_ROOTS),
  };
}
