import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 레포와 보드 번호는 레포 루트의 `project.config.json` 한 곳에서 읽는다. 패키지 밖의 파일이라 번들에 넣지 않고,
 * 요청 때 작업 디렉터리(`next dev` 는 `apps/backoffice`)에서 위로 거슬러 찾는다. dev 와 `next start` 는 레포 안에서
 * 돌아 찾고, 파일이 없는 자리(예: 루트 파일을 복사하지 않는 Docker 이미지)에서는 오류를 던진다.
 */

const FILE = 'project.config.json';

export type ProjectConfig = {
  /** REST 의 레포 소유자와 이름(`repo` 칸의 `owner/name`). */
  owner: string;
  repo: string;
  /** Projects v2 보드를 가진 사용자(`ghUser` 칸)와 보드 번호(`boardNumber` 칸). */
  boardOwner: string;
  boardNumber: number;
};

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConfigError';
  }
}

function findConfigFile(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseConfig(text: string) {
  try {
    return JSON.parse(text) as { repo?: unknown; ghUser?: unknown; boardNumber?: unknown };
  } catch {
    throw new ProjectConfigError(`${FILE} is not valid JSON`);
  }
}

export function loadProjectConfig(startDir: string = process.cwd()): ProjectConfig {
  const path = findConfigFile(startDir);
  if (path === null) throw new ProjectConfigError(`${FILE} was not found`);
  const raw = parseConfig(readFileSync(path, 'utf8'));
  const [owner, repo, extra] = typeof raw.repo === 'string' ? raw.repo.split('/') : [];
  if (!owner || !repo || extra !== undefined) {
    throw new ProjectConfigError(`${FILE} needs "repo" as "owner/name"`);
  }
  if (typeof raw.ghUser !== 'string' || !raw.ghUser) {
    throw new ProjectConfigError(`${FILE} needs "ghUser"`);
  }
  if (typeof raw.boardNumber !== 'number' || !Number.isInteger(raw.boardNumber)) {
    throw new ProjectConfigError(`${FILE} needs an integer "boardNumber"`);
  }
  return { owner, repo, boardOwner: raw.ghUser, boardNumber: raw.boardNumber };
}
