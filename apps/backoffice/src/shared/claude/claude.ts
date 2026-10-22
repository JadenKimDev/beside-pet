import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

/** `claude -p` 에 주는 도구. PRD #40 "지키는 것" 의 목록 그대로다. 올리기 명령(prd:push 등)은 화면의 버튼이 돌린다. */
export const CLAUDE_ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Grep',
  'Glob',
  'Write',
  'Edit',
  'Bash(pnpm docs:search:*)',
  'Bash(pnpm ledger:outcomes:*)',
  'Bash(git log:*)',
  'Bash(ls:*)',
];

/** `--append-system-prompt` 로 모델에 주는 지시. 화면 글이 아니다. */
export const PRD_CHAT_SYSTEM_PROMPT = [
  '이 대화는 운영 화면의 "PRD 쓰기" 채팅에서 온다. 사용자는 터미널이 아니라 웹 화면에서 답을 읽는다.',
  '1. herdr pane 을 열지 않는다. `pnpm prd:pane` 을 돌리지 않는다. 초안은 화면이 옆 칸에 보인다.',
  '2. 승인과 올리기는 화면의 "이슈로 올리기" 버튼이 한다. `pnpm prd:push`, `pnpm ledger:new`, `pnpm wt:create` 와 git commit, git push 를 돌리지 않는다.',
  '3. docs/prd/ 에 초안을 쓰거나 옮길 때마다 답의 맨 끝에 `PRD_DRAFT: docs/prd/<파일>.md` 한 줄을 그대로 적는다. 화면은 이 줄로 미리보기 파일을 안다.',
].join('\n');

const DROPPED_EXACT = new Set(['CLAUDECODE', 'GITHUB_TOKEN']);
const DROPPED_PREFIX = 'CLAUDE_CODE_';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STDERR_MAX = 64 * 1024;

/** 세션 id 로 받을 수 있는 uuid 인가. */
export function isSessionId(id: string): boolean {
  return UUID.test(id);
}

/** 자식 프로세스에 주는 env. Next 가 `NodeJS.ProcessEnv` 에 `NODE_ENV` 를 필수로 더하므로 따로 둔다. */
export type Env = Record<string, string | undefined>;

/** 자식 프로세스의 env: 부모의 것에서 `CLAUDECODE`, `CLAUDE_CODE_*`(중첩 세션 표지)와 `GITHUB_TOKEN` 을 뺀 것. */
export function childEnv(parent: Env = process.env): Env {
  return Object.fromEntries(
    Object.entries(parent).filter(
      ([key]) => !DROPPED_EXACT.has(key) && !key.startsWith(DROPPED_PREFIX),
    ),
  );
}

/** spawn 의 `env` 옵션 모양으로 거른 env. 거른 env 에는 `NODE_ENV` 가 없을 수 있어 타입만 맞춘다. */
export function spawnEnv(parent: Env = process.env): NodeJS.ProcessEnv {
  return childEnv(parent) as NodeJS.ProcessEnv;
}

/** `claude` 실행 파일을 찾지 못했다(503). */
export class ClaudeNotFoundError extends Error {
  constructor(executable: string) {
    super(`${executable} was not found on PATH`);
    this.name = 'ClaudeNotFoundError';
  }
}

/** 같은 세션에 `claude -p` 가 이미 돌고 있다(409). */
export class SessionBusyError extends Error {
  constructor(sessionId: string) {
    super(`session ${sessionId} is already running`);
    this.name = 'SessionBusyError';
  }
}

export type SpawnClaudeOptions = {
  /** 사용자가 보낸 글. 인자 배열의 원소 하나로만 간다. */
  message: string;
  /** 없으면 새 uuid 를 만든다. `resume` 이면 있어야 한다. */
  sessionId?: string;
  /** true 면 `--resume <sessionId>` 로 잇고 `/prd` 를 붙이지 않는다. */
  resume?: boolean;
  /** 레포 루트. */
  cwd: string;
  /** 부모 env. 기본은 `process.env`. 여기서 `childEnv` 로 거른다. */
  env?: Env;
  /** 기본 `claude`(PATH 에서 찾는다). */
  executable?: string;
};

export type ClaudeExit = { code: number | null; signal: NodeJS.Signals | null; stderr: string };

export type ClaudeProcess = {
  sessionId: string;
  /** stdout 의 줄(stream-json). `createStreamParser().push` 에 넣는다. */
  lines: AsyncIterable<string>;
  /** 프로세스가 끝나면 풀린다. 이때 세션 잠금도 풀린다. */
  done: Promise<ClaudeExit>;
  kill(): void;
};

/** 세션마다 도는 프로세스. 한 세션에 하나만 둔다. */
const running = new Set<string>();

/** `claude -p` 의 인자. 마지막 원소가 프롬프트다. `-` 로 시작하는 글은 옵션으로 읽히지 않게 앞에 빈칸을 둔다. */
export function claudeArgs(message: string, sessionId: string, resume: boolean): string[] {
  const prompt = resume ? message : `/prd ${message}`;
  return [
    '-p',
    resume ? '--resume' : '--session-id',
    sessionId,
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
    prompt.startsWith('-') ? ` ${prompt}` : prompt,
  ];
}

function started(child: ChildProcess, executable: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new ClaudeNotFoundError(executable) : error);
    });
  });
}

function exited(child: ChildProcess): Promise<ClaudeExit> {
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    if (stderr.length < STDERR_MAX) stderr += chunk.slice(0, STDERR_MAX - stderr.length);
  });
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

/**
 * `claude -p` 를 `shell: false` 로 띄운다. 새 세션은 `--session-id` 와 `/prd <message>`, 이어가기는 `--resume` 과 message.
 * 같은 세션이 돌고 있으면 `SessionBusyError`, 실행 파일이 없으면 `ClaudeNotFoundError` 로 거부된다.
 */
export async function spawnClaude(options: SpawnClaudeOptions): Promise<ClaudeProcess> {
  const resume = options.resume === true;
  const sessionId = options.sessionId ?? (resume ? '' : randomUUID());
  if (!isSessionId(sessionId)) throw new Error('session id must be a uuid');
  if (running.has(sessionId)) throw new SessionBusyError(sessionId);
  running.add(sessionId);

  const executable = options.executable ?? 'claude';
  const child = spawn(executable, claudeArgs(options.message, sessionId, resume), {
    cwd: options.cwd,
    env: spawnEnv(options.env),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const done = exited(child).finally(() => running.delete(sessionId));
  try {
    await started(child, executable);
  } catch (error) {
    running.delete(sessionId);
    throw error;
  }
  // 반복자를 바로 만들어 둔다. 늦게 만들면 그 전에 읽힌 줄을 잃는다.
  const iterator = createInterface({ input: child.stdout!, crlfDelay: Number.POSITIVE_INFINITY })[
    Symbol.asyncIterator
  ]();
  const lines: AsyncIterable<string> = { [Symbol.asyncIterator]: () => iterator };
  return { sessionId, lines, done, kill: () => child.kill() };
}
