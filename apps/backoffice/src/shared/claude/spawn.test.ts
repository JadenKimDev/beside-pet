import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLAUDE_ALLOWED_TOOLS,
  ClaudeNotFoundError,
  childEnv,
  PRD_CHAT_SYSTEM_PROMPT,
  SessionBusyError,
  spawnClaude,
} from './index';

const SID = '00000000-0000-4000-8000-000000000002';
// 지어낸 stream-json 두 줄(실측한 줄 모양을 줄인 것).
const LINES = [
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"안녕"}},"parent_tool_use_id":null}',
  '{"type":"result","subtype":"success","is_error":false,"result":"안녕"}',
];
// 셸에 끼우면 깨지는 글. 인자 하나로 그대로 가야 한다.
const NASTY = `그냥 "따옴표" 와 '홑따옴표'; echo pwned $(whoami) \`id\` && rm -rf /tmp/nothing\n둘째 줄 *`;

let dir: string;
let bin: string;
let out: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prd-chat-claude-'));
  bin = join(dir, 'bin');
  out = join(dir, 'out');
  mkdirSync(bin);
  mkdirSync(out);
  const script = join(bin, 'claude');
  // 받은 인자를 NUL 로 나눠 적고, env 의 키를 적고, stream-json 줄을 뱉는다. FAKE_SLEEP 이 있으면 끝나기 전에 쉰다.
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      'printf \'%s\\0\' "$@" > "$FAKE_OUT/args"',
      'env | cut -d= -f1 > "$FAKE_OUT/env"',
      ...LINES.map((l) => `printf '%s\\n' '${l}'`),
      'if [ -n "$FAKE_SLEEP" ]; then sleep "$FAKE_SLEEP"; fi',
      'echo "fake stderr" >&2',
    ].join('\n'),
  );
  chmodSync(script, 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const baseEnv = (extra: Record<string, string> = {}) => ({
  PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
  FAKE_OUT: out,
  ...extra,
});

const readArgs = () => readFileSync(join(out, 'args'), 'utf8').split('\0').slice(0, -1);
const readEnvKeys = () => readFileSync(join(out, 'env'), 'utf8').trim().split('\n');

const collect = async (lines: AsyncIterable<string>) => {
  const all: string[] = [];
  for await (const l of lines) all.push(l);
  return all;
};

const COMMON = [
  '--output-format',
  'stream-json',
  '--include-partial-messages',
  '--verbose',
  '--permission-mode',
  'acceptEdits',
  '--allowedTools',
  CLAUDE_ALLOWED_TOOLS.join(','),
  '--append-system-prompt',
  PRD_CHAT_SYSTEM_PROMPT,
];

describe('spawnClaude', () => {
  it('starts a new session with /prd and the message as one argument', async () => {
    const proc = await spawnClaude({ message: NASTY, sessionId: SID, cwd: dir, env: baseEnv() });
    expect(proc.sessionId).toBe(SID);
    expect(await collect(proc.lines)).toEqual(LINES);
    const exit = await proc.done;
    expect(exit.code).toBe(0);
    expect(exit.stderr).toContain('fake stderr');
    expect(readArgs()).toEqual(['-p', '--session-id', SID, ...COMMON, `/prd ${NASTY}`]);
  });

  it('makes a session id when none is given', async () => {
    const proc = await spawnClaude({ message: 'x', cwd: dir, env: baseEnv() });
    await collect(proc.lines);
    await proc.done;
    expect(proc.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(readArgs().slice(0, 3)).toEqual(['-p', '--session-id', proc.sessionId]);
  });

  it('resumes a session with the message alone', async () => {
    const proc = await spawnClaude({
      message: NASTY,
      sessionId: SID,
      resume: true,
      cwd: dir,
      env: baseEnv(),
    });
    await collect(proc.lines);
    await proc.done;
    expect(readArgs()).toEqual(['-p', '--resume', SID, ...COMMON, NASTY]);
  });

  it('keeps a message that looks like an option from being read as one', async () => {
    const proc = await spawnClaude({
      message: '--help',
      sessionId: SID,
      resume: true,
      cwd: dir,
      env: baseEnv(),
    });
    await collect(proc.lines);
    await proc.done;
    const last = readArgs().at(-1);
    expect(last?.startsWith('-')).toBe(false);
    expect(last?.trim()).toBe('--help');
  });

  it('rejects a session id that is not a uuid', async () => {
    await expect(
      spawnClaude({ message: 'x', sessionId: '../x', cwd: dir, env: baseEnv() }),
    ).rejects.toThrow();
  });

  it('drops GITHUB_TOKEN and the nested Claude Code markers from the child env', async () => {
    const env = baseEnv({
      GITHUB_TOKEN: 'fake-token',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CODE_SSE_PORT: '1234',
      KEEP_ME: 'yes',
    });
    const proc = await spawnClaude({ message: 'x', sessionId: SID, cwd: dir, env });
    await collect(proc.lines);
    await proc.done;
    const keys = readEnvKeys();
    expect(keys).toContain('KEEP_ME');
    expect(keys).not.toContain('GITHUB_TOKEN');
    expect(keys.filter((k) => k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_'))).toEqual([]);
  });

  it('refuses a second process on the same session until the first ends', async () => {
    const first = await spawnClaude({
      message: 'x',
      sessionId: SID,
      cwd: dir,
      env: baseEnv({ FAKE_SLEEP: '1' }),
    });
    await expect(
      spawnClaude({ message: 'y', sessionId: SID, cwd: dir, env: baseEnv() }),
    ).rejects.toBeInstanceOf(SessionBusyError);
    await collect(first.lines);
    await first.done;
    const again = await spawnClaude({ message: 'z', sessionId: SID, cwd: dir, env: baseEnv() });
    await collect(again.lines);
    await again.done;
  });

  it('throws ClaudeNotFoundError when the executable is missing, and frees the session', async () => {
    const env = { PATH: join(dir, 'nothing') };
    await expect(
      spawnClaude({ message: 'x', sessionId: SID, cwd: dir, env }),
    ).rejects.toBeInstanceOf(ClaudeNotFoundError);
    await expect(
      spawnClaude({
        message: 'x',
        sessionId: SID,
        cwd: dir,
        env,
        executable: 'no-such-claude-binary',
      }),
    ).rejects.toBeInstanceOf(ClaudeNotFoundError);
  });
});

describe('childEnv', () => {
  it('keeps other keys and drops the listed ones', () => {
    expect(
      childEnv({
        A: '1',
        GITHUB_TOKEN: 't',
        CLAUDECODE: '1',
        CLAUDE_CODE_X: 'y',
        CLAUDE_OTHER: 'keep',
      }),
    ).toEqual({ A: '1', CLAUDE_OTHER: 'keep' });
  });
});

describe('system prompt', () => {
  it('tells the model the three rules', () => {
    expect(PRD_CHAT_SYSTEM_PROMPT).toContain('prd:pane');
    for (const cmd of ['prd:push', 'ledger:new', 'wt:create'])
      expect(PRD_CHAT_SYSTEM_PROMPT).toContain(cmd);
    expect(PRD_CHAT_SYSTEM_PROMPT).toContain('PRD_DRAFT: docs/prd/');
  });

  it('allows exactly the tools in the PRD', () => {
    expect(CLAUDE_ALLOWED_TOOLS).toEqual([
      'Read',
      'Grep',
      'Glob',
      'Write',
      'Edit',
      'Bash(pnpm docs:search:*)',
      'Bash(pnpm ledger:outcomes:*)',
      'Bash(git log:*)',
      'Bash(ls:*)',
    ]);
  });
});
