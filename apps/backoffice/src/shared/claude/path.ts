import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CONFIG_FILE = 'project.config.json';
const DRAFT_NAME = /^[A-Za-z0-9._-]+\.md$/;

/** 레포 루트(`project.config.json` 이 있는 자리)를 `startDir` 에서 위로 찾는다. `shared/github` 의 설정 찾기와 같은 방식. */
export function repoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${CONFIG_FILE} was not found`);
    dir = parent;
  }
}

/** `docs/prd/` 아래의 초안 파일 이름으로 받을 수 있는가: `[A-Za-z0-9._-]+.md` 이고 `..`, `/`, `\` 가 없다. */
export function isDraftFileName(file: string): boolean {
  return (
    DRAFT_NAME.test(file) && !file.includes('..') && !file.includes('/') && !file.includes('\\')
  );
}

/** 초안 파일 이름을 `<root>/docs/prd/<file>` 절대 경로로 바꾼다. 받을 수 없는 이름이면 null. */
export function draftPath(file: string, root: string = repoRoot()): string | null {
  return isDraftFileName(file) ? join(root, 'docs', 'prd', file) : null;
}
