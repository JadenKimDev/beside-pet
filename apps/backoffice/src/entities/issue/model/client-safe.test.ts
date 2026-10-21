// `@/shared/github` 의 index 는 node:fs 와 GITHUB_TOKEN 을 쓰는 서버 전용 코드를 값으로 내보낸다.
// 브라우저에서 도는 entities·features 가 거기서 값을 가져오면 서버 코드가 번들에 들어가므로, 타입만 가져오게 지킨다.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const SLICES = ['entities/issue', 'entities/board', 'features/start-implementation'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** `@/shared/github` 를 값으로 가져오는 문장. `import type`·`export type` 만 허용한다. 주석은 보지 않는다. */
function valueImportsOfServerGithub(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const statements =
    code.match(/^\s*(?:import|export)\b[^;]*?from\s+['"]@\/shared\/github['"]/gm) ?? [];
  return statements
    .map((statement) => statement.trim())
    .filter((statement) => !/^(?:import|export)\s+type\s/.test(statement));
}

describe('client-safe imports of @/shared/github', () => {
  it('flags value imports and allows type-only ones', () => {
    expect(valueImportsOfServerGithub("import type { IssueCard } from '@/shared/github';")).toEqual(
      [],
    );
    expect(valueImportsOfServerGithub("export type { IssueCard } from '@/shared/github';")).toEqual(
      [],
    );
    expect(
      valueImportsOfServerGithub("import { BOARD_COLUMNS } from '@/shared/github';"),
    ).toHaveLength(1);
    expect(
      valueImportsOfServerGithub(
        "import { type IssueCard, TOKEN_MISSING_MESSAGE } from '@/shared/github';",
      ),
    ).toHaveLength(1);
    expect(valueImportsOfServerGithub("export * from '@/shared/github';")).toHaveLength(1);
    expect(
      valueImportsOfServerGithub(
        "// `export type` 만 쓴다\nimport { BOARD_COLUMNS } from '@/shared/github';",
      ),
    ).toHaveLength(1);
    expect(
      valueImportsOfServerGithub(
        "// 값(`export type` 아님)\nexport type { IssueCard } from '@/shared/github';",
      ),
    ).toEqual([]);
  });

  it.each(SLICES)('%s imports only types from @/shared/github', (slice) => {
    const files = sourceFiles(join(SRC, slice));
    expect(files.length).toBeGreaterThan(0);
    const offending = files.flatMap((file) =>
      valueImportsOfServerGithub(readFileSync(file, 'utf8')).map(
        (statement) => `${relative(SRC, file)}: ${statement}`,
      ),
    );
    expect(offending).toEqual([]);
  });
});
