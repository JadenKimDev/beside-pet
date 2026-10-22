import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { draftPath, isDraftFileName, repoRoot } from './index';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'prd-chat-path-'));
  writeFileSync(join(root, 'project.config.json'), '{}');
  mkdirSync(join(root, 'apps', 'backoffice'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('isDraftFileName', () => {
  it('accepts plain markdown basenames', () => {
    for (const ok of ['a.md', '40-backoffice-prd-chat.md', 'A_b.c-1.md']) {
      expect(isDraftFileName(ok), ok).toBe(true);
    }
  });

  it('rejects traversal, separators and other extensions', () => {
    for (const bad of [
      '../a.md',
      '..md',
      'a/../b.md',
      '/etc/passwd',
      'a/b.md',
      'a\\b.md',
      'a.txt',
      '.md',
      'a b.md',
      '',
      'a.md\n',
    ]) {
      expect(isDraftFileName(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('repoRoot', () => {
  it('walks up from the start directory to project.config.json', () => {
    expect(repoRoot(join(root, 'apps', 'backoffice'))).toBe(root);
  });

  it('throws when there is no project.config.json', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'prd-chat-noroot-'));
    try {
      expect(() => repoRoot(lonely)).toThrow(/project\.config\.json/);
    } finally {
      rmSync(lonely, { recursive: true, force: true });
    }
  });
});

describe('draftPath', () => {
  it('returns the absolute path under docs/prd of the given root', () => {
    expect(draftPath('fake-draft.md', root)).toBe(join(root, 'docs', 'prd', 'fake-draft.md'));
  });

  it('returns null for names that are not plain markdown basenames', () => {
    for (const bad of ['../x.md', '/etc/passwd', 'a/b.md', 'a\\b.md', 'x.json']) {
      expect(draftPath(bad, root), bad).toBeNull();
    }
  });
});
