import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type PublishEvent,
  PublishParseError,
  parsePushOutput,
  publishPlan,
  publishPlanAfterPush,
  runPublish,
} from './index';

// `pnpm prd:push` 의 새 이슈 출력(dev-tools/src/cli.ts 의 prdPush). 이슈 번호와 제목은 지어낸 값이다.
const PUSH_OUTPUT = [
  '이슈 #977 를 만들었습니다 — [QA 테스트] 지어낸 문서 PRD',
  'https://github.com/fake-owner/fake-repo/issues/977',
  '캐시: docs/prd/977-fake-draft.md',
  '',
].join('\n');

describe('publishPlan', () => {
  it('starts with prd:push of the draft under docs/prd', () => {
    expect(publishPlan('fake-draft.md')).toEqual([
      { step: 'push', command: 'pnpm', args: ['prd:push', 'docs/prd/fake-draft.md'] },
    ]);
  });

  it('throws for a file name outside docs/prd', () => {
    for (const bad of ['../x.md', 'a/b.md', '/etc/passwd', 'x.txt']) {
      expect(() => publishPlan(bad), bad).toThrow();
    }
  });
});

describe('parsePushOutput', () => {
  it('reads the issue number, url and cache file', () => {
    expect(parsePushOutput(PUSH_OUTPUT)).toEqual({
      issue: 977,
      url: 'https://github.com/fake-owner/fake-repo/issues/977',
      cacheFile: '977-fake-draft.md',
    });
  });

  it('fails clearly when the output does not say a new issue was made', () => {
    expect(() => parsePushOutput('이슈 #12 본문을 갱신했습니다 — 지어낸 제목\n')).toThrow(
      PublishParseError,
    );
    expect(() => parsePushOutput('')).toThrow(PublishParseError);
  });

  it('fails when the cache path is not a plain file under docs/prd', () => {
    const bad = PUSH_OUTPUT.replace('docs/prd/977-fake-draft.md', 'docs/prd/../../etc/passwd');
    expect(() => parsePushOutput(bad)).toThrow(PublishParseError);
  });
});

describe('publishPlanAfterPush', () => {
  it('lists ledger, commit, push and worktree with the issue number', () => {
    expect(publishPlanAfterPush(PUSH_OUTPUT)).toEqual([
      { step: 'ledger', command: 'pnpm', args: ['ledger:new', 'docs/prd/977-fake-draft.md'] },
      { step: 'commit', command: 'git', args: ['add', 'docs/ledger/977.json'] },
      { step: 'commit', command: 'git', args: ['commit', '-m', 'chore(ledger): #977 원장'] },
      { step: 'git-push', command: 'git', args: ['push', 'origin', 'main'] },
      { step: 'worktree', command: 'pnpm', args: ['wt:create', '977'] },
    ]);
  });
});

describe('runPublish', () => {
  let dir: string;
  let bin: string;
  let log: string;

  /** 가짜 pnpm 과 git. 받은 인자를 log 에 적고, FAIL_ON 과 인자가 같으면 실패한다. */
  const fake = (name: string, stdout: string) => {
    const path = join(bin, name);
    writeFileSync(
      path,
      [
        '#!/bin/sh',
        `echo "${name} $*" >> "$FAKE_LOG"`,
        `if [ "${name} $*" = "$FAIL_ON" ]; then echo "fake failure from ${name}" >&2; exit 3; fi`,
        `printf '%s' '${stdout}'`,
      ].join('\n'),
    );
    chmodSync(path, 0o755);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prd-chat-publish-'));
    bin = join(dir, 'bin');
    log = join(dir, 'calls.log');
    writeFileSync(log, '');
    mkdirSync(bin);
    fake('pnpm', PUSH_OUTPUT);
    fake('git', 'ok\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = async (failOn = '') => {
    const env = {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      FAKE_LOG: log,
      FAIL_ON: failOn,
      GITHUB_TOKEN: 'fake-token-must-not-pass',
    };
    const events: PublishEvent[] = [];
    for await (const event of runPublish('fake-draft.md', { cwd: dir, env })) events.push(event);
    return { events, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  };

  it('runs the five steps in order and reports each', async () => {
    const { events, calls } = await run();
    expect(calls).toEqual([
      'pnpm prd:push docs/prd/fake-draft.md',
      'pnpm ledger:new docs/prd/977-fake-draft.md',
      'git add docs/ledger/977.json',
      'git commit -m chore(ledger): #977 원장',
      'git push origin main',
      'pnpm wt:create 977',
    ]);
    expect(events.map((e) => `${e.step}:${e.status}`)).toEqual([
      'push:running',
      'push:ok',
      'ledger:running',
      'ledger:ok',
      'commit:running',
      'commit:ok',
      'git-push:running',
      'git-push:ok',
      'worktree:running',
      'worktree:ok',
    ]);
    const pushed = events.find((e) => e.step === 'push' && e.status === 'ok');
    expect(pushed?.issue).toBe(977);
    expect(pushed?.url).toBe('https://github.com/fake-owner/fake-repo/issues/977');
  });

  it('stops at the failing step and returns its output', async () => {
    const { events, calls } = await run('git push origin main');
    expect(calls.at(-1)).toBe('git push origin main');
    expect(calls).not.toContain('pnpm wt:create 977');
    const last = events.at(-1);
    expect(last?.step).toBe('git-push');
    expect(last?.status).toBe('failed');
    expect(last?.output).toContain('fake failure from git');
    expect(events.some((e) => e.step === 'worktree')).toBe(false);
  });

  it('stops after push when its output cannot be read', async () => {
    fake('pnpm', '이슈 #12 본문을 갱신했습니다 — 지어낸 제목\n');
    const { events, calls } = await run();
    expect(calls).toEqual(['pnpm prd:push docs/prd/fake-draft.md']);
    expect(events.at(-1)).toMatchObject({ step: 'push', status: 'failed' });
  });

  it('fails the step when the command is missing', async () => {
    const events: PublishEvent[] = [];
    for await (const event of runPublish('fake-draft.md', {
      cwd: dir,
      env: { PATH: join(dir, 'nothing') },
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toMatchObject({ step: 'push', status: 'failed' });
  });

  it('refuses a bad file name before running anything', async () => {
    await expect(async () => {
      for await (const _ of runPublish('../x.md', { cwd: dir, env: { PATH: bin } })) {
        // 돌지 않아야 한다
      }
    }).rejects.toThrow();
    expect(readFileSync(log, 'utf8')).toBe('');
  });
});
