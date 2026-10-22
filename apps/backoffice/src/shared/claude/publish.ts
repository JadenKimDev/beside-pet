import { spawn as nodeSpawn } from 'node:child_process';
import { type Env, spawnEnv } from './claude';
import type { PublishCommand, PublishEvent, PublishStep } from './events';
import { isDraftFileName } from './path';

/** `prd:push` 의 출력에서 이슈 번호나 캐시 경로를 읽지 못했다. */
export class PublishParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishParseError';
  }
}

/** `docs/prd/` 아래가 아닌 파일 이름을 받았다(400). */
export class InvalidDraftFileError extends Error {
  constructor(file: string) {
    super(`not a draft file under docs/prd: ${JSON.stringify(file)}`);
    this.name = 'InvalidDraftFileError';
  }
}

export type PushResult = { issue: number; url: string; cacheFile: string };

// dev-tools/src/cli.ts 의 prdPush 가 새 이슈를 만들었을 때의 세 줄.
const CREATED = /^이슈 #(\d+) 를 만들었습니다/m;
const URL_LINE = /^(https:\/\/\S+)$/m;
const CACHE_LINE = /^캐시: docs\/prd\/(\S+)$/m;

/** 올리기의 첫 단계: `pnpm prd:push docs/prd/<file>`. 받을 수 없는 이름이면 `InvalidDraftFileError`. */
export function publishPlan(file: string): PublishCommand[] {
  if (!isDraftFileName(file)) throw new InvalidDraftFileError(file);
  return [{ step: 'push', command: 'pnpm', args: ['prd:push', `docs/prd/${file}`] }];
}

/** `prd:push` 의 출력에서 이슈 번호(정수), URL, 번호가 붙은 캐시 파일 이름을 읽는다. 못 읽으면 `PublishParseError`. */
export function parsePushOutput(output: string): PushResult {
  const issue = Number(CREATED.exec(output)?.[1]);
  if (!Number.isSafeInteger(issue) || issue <= 0) {
    throw new PublishParseError('prd:push did not report a new issue number');
  }
  const url = URL_LINE.exec(output)?.[1];
  if (url === undefined) throw new PublishParseError('prd:push did not report the issue url');
  const cacheFile = CACHE_LINE.exec(output)?.[1];
  if (cacheFile === undefined || !isDraftFileName(cacheFile)) {
    throw new PublishParseError('prd:push did not report a cache file under docs/prd');
  }
  return { issue, url, cacheFile };
}

/** `prd:push` 뒤의 네 단계: 원장, 원장 커밋(add 와 commit), main 푸시, 워크트리. */
export function publishPlanAfterPush(pushOutput: string): PublishCommand[] {
  const { issue, cacheFile } = parsePushOutput(pushOutput);
  return [
    { step: 'ledger', command: 'pnpm', args: ['ledger:new', `docs/prd/${cacheFile}`] },
    { step: 'commit', command: 'git', args: ['add', `docs/ledger/${issue}.json`] },
    { step: 'commit', command: 'git', args: ['commit', '-m', `chore(ledger): #${issue} 원장`] },
    { step: 'git-push', command: 'git', args: ['push', 'origin', 'main'] },
    { step: 'worktree', command: 'pnpm', args: ['wt:create', String(issue)] },
  ];
}

export type RunPublishOptions = {
  /** 레포 루트(본 체크아웃). */
  cwd: string;
  /** 부모 env. 기본은 `process.env`. `childEnv` 로 거른다. */
  env?: Env;
  /** 테스트용 주입. 기본은 node 의 spawn. */
  spawn?: typeof nodeSpawn;
};

type Outcome = { ok: boolean; output: string };

function runCommand(cmd: PublishCommand, options: RunPublishOptions): Promise<Outcome> {
  const spawn = options.spawn ?? nodeSpawn;
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(cmd.command, cmd.args, {
      cwd: options.cwd,
      env: spawnEnv(options.env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk: Buffer) => {
      output += chunk.toString('utf8');
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('error', (error) => resolve({ ok: false, output: `${output}${error.message}\n` }));
    child.once('close', (code) => resolve({ ok: code === 0, output }));
  });
}

async function* runStep(step: PublishStep, commands: PublishCommand[], options: RunPublishOptions) {
  yield { step, status: 'running', output: '' } satisfies PublishEvent;
  let output = '';
  for (const cmd of commands) {
    const outcome = await runCommand(cmd, options);
    output += outcome.output;
    if (!outcome.ok) return { ok: false, output };
  }
  return { ok: true, output };
}

const STEPS: PublishStep[] = ['ledger', 'commit', 'git-push', 'worktree'];

/**
 * 다섯 단계를 순서대로 자식 프로세스(`shell: false`)로 돌리며 단계마다 `running` 과 `ok`/`failed` 를 낸다.
 * 한 단계가 실패하면 그 뒤를 돌리지 않고 `failed` 와 그 단계의 출력으로 끝난다. 이미 한 단계는 되돌리지 않는다.
 * 받을 수 없는 파일 이름이면 아무것도 돌리지 않고 `InvalidDraftFileError` 를 던진다.
 */
export async function* runPublish(
  file: string,
  options: RunPublishOptions,
): AsyncGenerator<PublishEvent> {
  const [push] = publishPlan(file);
  const pushed = yield* runStep('push', [push], options);
  if (!pushed.ok) {
    yield { step: 'push', status: 'failed', output: pushed.output };
    return;
  }
  let rest: PublishCommand[];
  let result: PushResult;
  try {
    result = parsePushOutput(pushed.output);
    rest = publishPlanAfterPush(pushed.output);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    yield { step: 'push', status: 'failed', output: `${pushed.output}\n${reason}` };
    return;
  }
  yield { step: 'push', status: 'ok', output: pushed.output, issue: result.issue, url: result.url };

  for (const step of STEPS) {
    const outcome = yield* runStep(
      step,
      rest.filter((cmd) => cmd.step === step),
      options,
    );
    yield { step, status: outcome.ok ? 'ok' : 'failed', output: outcome.output };
    if (!outcome.ok) return;
  }
}
