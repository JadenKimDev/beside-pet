import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import {
  type ChatEvent,
  type ClaudeExit,
  ClaudeNotFoundError,
  type ClaudeProcess,
  createStreamParser,
  draftPath,
  type Env,
  isDraftFileName,
  isSessionId,
  repoRoot,
  runPublish,
  SessionBusyError,
  spawnClaude,
} from '@/shared/claude';
import { isAdminRequest } from '@/shared/github';

/**
 * `/api/prd-chat/*` 의 Route Handler 가 부르는 함수. 판정은 서버의 `/v1/auth/me` 다(관리자가 아니면 403).
 * 요청 본문, 프롬프트, 초안 본문은 로그와 오류 문구에 싣지 않는다. 띄우는 프로세스는 `@/shared/claude` 의 것뿐이다.
 */

export const CLAUDE_MISSING_MESSAGE =
  '이 Mac 에 Claude Code 가 설치되어 있고 로그인돼 있어야 해요.';
export const SESSION_BUSY_MESSAGE = '답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.';
const MESSAGE_REQUIRED = '메시지를 적어 주세요.';
const SPAWN_FAILED = 'claude 를 띄우지 못했어요.';
const INVALID_SESSION = '세션 id 가 올바르지 않아요.';
const INVALID_DRAFT = '초안 파일 이름이 올바르지 않아요.';
const DRAFT_MISSING = '초안이 아직 없어요.';
const ERROR_MAX = 500;

/** 테스트용 주입. 기본은 이 프로세스의 레포 루트와 env, PATH 의 `claude`. */
export type PrdChatDeps = {
  /** `claude -p` 의 cwd 와 초안을 읽는 자리. 기본 `repoRoot()`. */
  root?: string;
  /** 올리기의 cwd(본 체크아웃). 기본 `mainCheckout(repoRoot())`. */
  publishRoot?: string;
  /** 자식 프로세스의 부모 env. 기본 `process.env`. */
  env?: Env;
  executable?: string;
};

const NO_STORE = { 'Cache-Control': 'no-store' };

const failure = (status: number, message: string): Response =>
  Response.json({ error: message }, { status, headers: NO_STORE });

const forbidden = async (request: Request): Promise<Response | null> =>
  (await isAdminRequest(request)) ? null : failure(403, 'Forbidden');

/** 이벤트를 한 줄에 하나씩 JSON 으로 흘린다. 받는 쪽이 끊으면 `onCancel` 을 부른다. */
function ndjson<T>(events: AsyncGenerator<T>, onCancel: () => void = () => {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await events.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
    },
    async cancel() {
      onCancel();
      await events.return(undefined);
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson', ...NO_STORE },
  });
}

async function requestedMessage(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const message =
      body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
    return typeof message === 'string' && message.trim() !== '' ? message : null;
  } catch {
    return null;
  }
}

function exitMessage(exit: ClaudeExit): string {
  const stderr = exit.stderr.trim();
  if (stderr) return stderr.slice(0, ERROR_MAX);
  return exit.signal
    ? `claude 가 ${exit.signal} 로 끝났어요.`
    : `claude 가 코드 ${exit.code} 로 끝났어요.`;
}

async function* chatEvents(proc: ClaudeProcess): AsyncGenerator<ChatEvent> {
  yield { type: 'session', id: proc.sessionId };
  const parser = createStreamParser();
  let sawResult = false;
  for await (const line of proc.lines) {
    for (const event of parser.push(line)) {
      if (event.type === 'result') sawResult = true;
      yield event;
    }
  }
  yield* parser.end();
  const exit = await proc.done;
  if (exit.code !== 0 && !sawResult) yield { type: 'error', message: exitMessage(exit) };
}

async function chat(
  request: Request,
  deps: PrdChatDeps,
  session: { sessionId?: string; resume?: boolean },
): Promise<Response> {
  const message = await requestedMessage(request);
  if (message === null) return failure(400, MESSAGE_REQUIRED);
  let proc: ClaudeProcess;
  try {
    proc = await spawnClaude({
      message,
      ...session,
      cwd: deps.root ?? repoRoot(),
      env: deps.env,
      executable: deps.executable,
    });
  } catch (cause) {
    if (cause instanceof ClaudeNotFoundError) return failure(503, CLAUDE_MISSING_MESSAGE);
    if (cause instanceof SessionBusyError) return failure(409, SESSION_BUSY_MESSAGE);
    return failure(500, SPAWN_FAILED);
  }
  request.signal.addEventListener('abort', () => proc.kill(), { once: true });
  return ndjson(chatEvents(proc), () => proc.kill());
}

/** `POST /api/prd-chat/sessions`: 새 세션으로 `claude -p "/prd <message>"` 를 띄워 흘린다. */
export async function sessionResponse(request: Request, deps: PrdChatDeps = {}): Promise<Response> {
  const denied = await forbidden(request);
  if (denied) return denied;
  return chat(request, deps, {});
}

/** `POST /api/prd-chat/sessions/[id]/messages`: `--resume <id>` 로 같은 세션을 잇는다. */
export async function messageResponse(
  id: string,
  request: Request,
  deps: PrdChatDeps = {},
): Promise<Response> {
  const denied = await forbidden(request);
  if (denied) return denied;
  if (!isSessionId(id)) return failure(400, INVALID_SESSION);
  return chat(request, deps, { sessionId: id, resume: true });
}

async function mtimeOf(path: string): Promise<Date | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.mtime : null;
  } catch {
    return null;
  }
}

/** `GET /api/prd-chat/drafts/[file]`: `docs/prd/<file>` 의 본문과 mtime. */
export async function draftResponse(
  file: string,
  request: Request,
  deps: PrdChatDeps = {},
): Promise<Response> {
  const denied = await forbidden(request);
  if (denied) return denied;
  const path = draftPath(file, deps.root ?? repoRoot());
  if (path === null) return failure(400, INVALID_DRAFT);
  const mtime = await mtimeOf(path);
  if (mtime === null) return failure(404, DRAFT_MISSING);
  try {
    const body = await readFile(path, 'utf8');
    return Response.json({ file, body, updatedAt: mtime.toISOString() }, { headers: NO_STORE });
  } catch {
    return failure(404, DRAFT_MISSING);
  }
}

const run = promisify(execFile);

/** 이 레포의 git 명령. 올리기 전제 확인용이고 가짜 PATH 를 쓰지 않는다. */
async function gitOut(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, encoding: 'utf8' });
  return stdout;
}

/** 본 체크아웃(워크트리가 아닌 자리)의 루트. `dev-tools/scripts/wt.sh` 의 REPO_ROOT 와 같은 방식이다. */
export async function mainCheckout(cwd: string): Promise<string> {
  const common = await gitOut(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return dirname(common.trim());
}

/** `git status --porcelain` 의 줄에서 경로를 꺼낸다. 이름 바꾸기(`a -> b`)는 둘 다. */
function porcelainPaths(line: string): string[] {
  return line
    .slice(3)
    .split(' -> ')
    .map((path) => path.replace(/^"|"$/g, ''));
}

/** 올리기 전제: 본 체크아웃이 `main` 이고 `docs/ledger/` 밖에 추적되는 변경이 없다. 어긋나면 그 이유. */
async function publishBlocker(cwd: string): Promise<string | null> {
  const branch = (await gitOut(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (branch !== 'main') {
    return `본 체크아웃이 main 이 아니에요(지금 ${branch}). 터미널에서 main 으로 옮긴 뒤 다시 눌러 주세요.`;
  }
  const dirty = (await gitOut(cwd, ['status', '--porcelain']))
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('??'))
    .flatMap(porcelainPaths)
    .filter((path) => !path.startsWith('docs/ledger/'));
  return dirty.length === 0
    ? null
    : `본 체크아웃에 docs/ledger/ 밖의 커밋하지 않은 변경이 있어요: ${dirty.join(', ')}`;
}

/** `POST /api/prd-chat/drafts/[file]/publish`: 전제를 보고 올리기 다섯 단계를 흘린다. */
export async function publishResponse(
  file: string,
  request: Request,
  deps: PrdChatDeps = {},
): Promise<Response> {
  const denied = await forbidden(request);
  if (denied) return denied;
  if (!isDraftFileName(file)) return failure(400, INVALID_DRAFT);
  let cwd: string;
  let blocker: string | null;
  try {
    cwd = deps.publishRoot ?? (await mainCheckout(repoRoot()));
    blocker = await publishBlocker(cwd);
  } catch {
    return failure(500, '본 체크아웃의 git 상태를 읽지 못했어요.');
  }
  const path = draftPath(file, cwd);
  if (path === null) return failure(400, INVALID_DRAFT);
  if ((await mtimeOf(path)) === null) return failure(404, DRAFT_MISSING);
  if (blocker !== null) return failure(409, blocker);
  return ndjson(runPublish(file, { cwd, env: deps.env }));
}
