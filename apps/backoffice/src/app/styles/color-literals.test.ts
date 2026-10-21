import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 색 값은 app/globals.css 의 토큰에만 둔다. 레포 검사의 색 리터럴 규칙은 apps/web 만 보므로 여기서 지킨다.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('color literals', () => {
  it('keeps colour values out of components and routes', () => {
    const offenders = [join(root, 'src'), join(root, 'app')]
      .flatMap(sources)
      .filter((path) => COLOR.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('defines the tokens the shared UI uses', () => {
    const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
    for (const token of [
      '--bg',
      '--surface',
      '--fg',
      '--fg-muted',
      '--border',
      '--accent',
      '--danger',
    ]) {
      expect(css).toContain(`${token}:`);
    }
  });
});
