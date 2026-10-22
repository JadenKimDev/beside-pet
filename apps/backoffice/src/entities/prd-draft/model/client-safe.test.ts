// `@/shared/claude` 는 node:child_process·node:fs 를 쓰는 서버 전용 모듈이다. 브라우저에서 도는 이 슬라이스들은
// 거기서 타입만 가져온다(`import type`·`export type`). 값을 가져오면 서버 코드가 클라이언트 번들에 들어간다.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const SLICES = ['entities/prd-draft', 'features/prd-chat', 'features/publish-prd'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

function valueImportsOfServerClaude(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const statements =
    code.match(/^\s*(?:import|export)\b[^;]*?from\s+['"]@\/shared\/claude['"]/gm) ?? [];
  return statements
    .map((statement) => statement.trim())
    .filter((statement) => !/^(?:import|export)\s+type\s/.test(statement));
}

describe('client-safe imports of @/shared/claude', () => {
  it('flags value imports and allows type-only ones', () => {
    expect(valueImportsOfServerClaude("import type { ChatEvent } from '@/shared/claude';")).toEqual(
      [],
    );
    expect(
      valueImportsOfServerClaude("import { spawnClaude } from '@/shared/claude';"),
    ).toHaveLength(1);
    expect(valueImportsOfServerClaude("export * from '@/shared/claude';")).toHaveLength(1);
  });

  it.each(SLICES)('%s imports only types from @/shared/claude', (slice) => {
    const files = sourceFiles(join(SRC, slice));
    expect(files.length).toBeGreaterThan(0);
    const offending = files.flatMap((file) =>
      valueImportsOfServerClaude(readFileSync(file, 'utf8')).map(
        (statement) => `${relative(SRC, file)}: ${statement}`,
      ),
    );
    expect(offending).toEqual([]);
  });
});
