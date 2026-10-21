import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const route = fileURLToPath(
  new URL('../../../app/(dashboard)/dev-notes/page.tsx', import.meta.url),
);

describe('/dev-notes route', () => {
  it('renders the dev notes view inside the dashboard layout', () => {
    expect(existsSync(route)).toBe(true);
    expect(readFileSync(route, 'utf8')).toContain("from '@/views/dev-notes'");
  });
});
