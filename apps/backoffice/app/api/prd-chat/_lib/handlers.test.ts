import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_MISSING_MESSAGE,
  draftResponse,
  mainCheckout,
  messageResponse,
  type PrdChatDeps,
  publishResponse,
  SESSION_BUSY_MESSAGE,
  sessionResponse,
} from './handlers';

// 지어낸 값만 쓴다.
const SID = '00000000-0000-4000-8000-0000000000aa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STREAM = [
  '{"type":"system","subtype":"init"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"초안을 썼어요.\\nPRD_DRAFT: docs/prd/fake-draft.md\\n"}},"parent_tool_use_id":null}',
  '{"type":"result","subtype":"success","is_error":false,"result":"끝"}',
];
const BAD_NAMES = ['..', '/etc/passwd', 'a/b.md', 'x.txt'];

let dir: string;
let bin: string;
let root: string;

function script(name: string, lines: string[]) {
  const path = join(bin, name);
  writeFileSync(path, ['#!/bin/sh', ...lines].join('\n'));
  chmodSync(path, 0o755);
}

function fakeClaude(lines: string[], tail: string[] = []) {
  script('claude', [...lines.map((l) => `printf '%s\\n' '${l}'`), ...tail]);
}

const env = () => ({ PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` });
const deps = (extra: Partial<PrdChatDeps> = {}): PrdChatDeps => ({
  root,
  publishRoot: root,
  env: env(),
  ...extra,
});

const ADMIN_COOKIE = 'beside-pet.token=fake-admin';
const post = (url: string, body: unknown, cookie = ADMIN_COOKIE, signal?: AbortSignal) =>
  new Request(`http://127.0.0.1:3002${url}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
const get = (url: string, cookie = ADMIN_COOKIE) =>
  new Request(`http://127.0.0.1:3002${url}`, { headers: { cookie } });

async function lines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'prd-chat-handlers-')));
  bin = join(dir, 'bin');
  root = join(dir, 'repo');
  mkdirSync(bin);
  mkdirSync(join(root, 'docs', 'prd'), { recursive: true });
  // 서버의 /v1/auth/me 를 흉내낸다: 관리자 쿠키만 admin.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get('cookie');
      return cookie === ADMIN_COOKIE
        ? Response.json({ role: 'admin' })
        : Response.json({ role: 'user' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe('관리자 확인', () => {
  const USER = 'beside-pet.token=fake-user';
  it('비관리자는 넷 모두 403', async () => {
    fakeClaude(STREAM);
    const responses = [
      await sessionResponse(post('/api/prd-chat/sessions', { message: '안녕' }, USER), deps()),
      await messageResponse(
        SID,
        post(`/api/prd-chat/sessions/${SID}/messages`, { message: '안녕' }, USER),
        deps(),
      ),
      await draftResponse('fake-draft.md', get('/api/prd-chat/drafts/fake-draft.md', USER), deps()),
      await publishResponse(
        'fake-draft.md',
        post('/api/prd-chat/drafts/fake-draft.md/publish', {}, USER),
        deps(),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
    }
  });

  it('쿠키가 없어도 403', async () => {
    const response = await sessionResponse(
      post('/api/prd-chat/sessions', { message: '안녕' }, ''),
      deps(),
    );
    expect(response.status).toBe(403);
  });
});

describe('POST /api/prd-chat/sessions', () => {
  it('첫 줄은 session, 이어서 stream-json 에서 만든 이벤트가 NDJSON 으로 온다', async () => {
    fakeClaude(STREAM);
    const response = await sessionResponse(
      post('/api/prd-chat/sessions', { message: '보드에 열을 하나 더해 줘' }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const events = await lines(response);
    const first = events[0] as { type: string; id: string };
    expect(first.type).toBe('session');
    expect(first.id).toMatch(UUID);
    expect(events.slice(1)).toEqual([
      { type: 'text_delta', text: '초안을 썼어요.\nPRD_DRAFT: docs/prd/fake-draft.md\n' },
      { type: 'draft', file: 'fake-draft.md' },
      { type: 'result', ok: true },
    ]);
  });

  it('빈 글은 400', async () => {
    fakeClaude(STREAM);
    for (const body of [{ message: '' }, { message: '   ' }, {}, { message: 3 }]) {
      const response = await sessionResponse(post('/api/prd-chat/sessions', body), deps());
      expect(response.status).toBe(400);
      expect((await response.json()) as { error: string }).toHaveProperty('error');
    }
  });

  it('claude 가 없으면 503 과 안내 문구', async () => {
    const response = await sessionResponse(
      post('/api/prd-chat/sessions', { message: '안녕' }),
      deps({ executable: join(dir, 'no-such-claude') }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: CLAUDE_MISSING_MESSAGE });
    expect(CLAUDE_MISSING_MESSAGE).toBe(
      '이 Mac 에 Claude Code 가 설치되어 있고 로그인돼 있어야 해요.',
    );
  });

  it('result 없이 0 이 아닌 코드로 끝나면 stderr 앞부분으로 error 를 보내고 닫는다', async () => {
    fakeClaude([], [`printf '%s' '${'x'.repeat(2000)}' >&2`, 'exit 3']);
    const events = await lines(
      await sessionResponse(post('/api/prd-chat/sessions', { message: '안녕' }), deps()),
    );
    expect(events).toHaveLength(2);
    const last = events[1] as { type: string; message: string };
    expect(last.type).toBe('error');
    expect(last.message.startsWith('xxx')).toBe(true);
    expect(last.message.length).toBeLessThanOrEqual(500);
  });

  it('result 가 있었으면 종료 코드가 0 이 아니어도 error 를 덧붙이지 않는다', async () => {
    fakeClaude(
      ['{"type":"result","subtype":"error_during_execution","is_error":true,"result":"막혔어요"}'],
      ['exit 1'],
    );
    const events = await lines(
      await sessionResponse(post('/api/prd-chat/sessions', { message: '안녕' }), deps()),
    );
    expect(events.slice(1)).toEqual([{ type: 'result', ok: false, error: '막혔어요' }]);
  });

  it('클라이언트가 끊으면 프로세스를 끝내 같은 세션을 다시 쓸 수 있다', async () => {
    fakeClaude(STREAM.slice(0, 2), ['sleep 30']);
    const controller = new AbortController();
    const started = Date.now();
    const response = await messageResponse(
      SID,
      post(
        `/api/prd-chat/sessions/${SID}/messages`,
        { message: '안녕' },
        ADMIN_COOKIE,
        controller.signal,
      ),
      deps(),
    );
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => {});
    fakeClaude(STREAM);
    // 잠금이 풀릴 때까지 잠깐 기다린다(kill 뒤 close).
    let again: Response | undefined;
    for (let i = 0; i < 50; i++) {
      const response = await messageResponse(
        SID,
        post(`/api/prd-chat/sessions/${SID}/messages`, { message: '다시' }),
        deps(),
      );
      again = response;
      if (response.status !== 409) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(again?.status).toBe(200);
    await again?.text();
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe('POST /api/prd-chat/sessions/[id]/messages', () => {
  it('같은 모양으로 흘린다(첫 줄은 그 세션 id)', async () => {
    fakeClaude(STREAM);
    const response = await messageResponse(
      SID,
      post(`/api/prd-chat/sessions/${SID}/messages`, { message: '검증 명령을 바꿔' }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const events = await lines(response);
    expect(events[0]).toEqual({ type: 'session', id: SID });
    expect(events.at(-1)).toEqual({ type: 'result', ok: true });
  });

  it('uuid 가 아닌 id 는 400', async () => {
    fakeClaude(STREAM);
    for (const id of ['abc', '../x', `${SID}0`]) {
      const response = await messageResponse(
        id,
        post(`/api/prd-chat/sessions/x/messages`, { message: '안녕' }),
        deps(),
      );
      expect(response.status).toBe(400);
    }
  });

  it('빈 글은 400', async () => {
    fakeClaude(STREAM);
    const response = await messageResponse(
      SID,
      post(`/api/prd-chat/sessions/${SID}/messages`, { message: '' }),
      deps(),
    );
    expect(response.status).toBe(400);
  });

  it('같은 세션이 아직 돌면 409 와 안내 문구', async () => {
    fakeClaude(STREAM.slice(0, 2), ['sleep 1']);
    const first = await messageResponse(
      SID,
      post(`/api/prd-chat/sessions/${SID}/messages`, { message: '하나' }),
      deps(),
    );
    const second = await messageResponse(
      SID,
      post(`/api/prd-chat/sessions/${SID}/messages`, { message: '둘' }),
      deps(),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: SESSION_BUSY_MESSAGE });
    expect(SESSION_BUSY_MESSAGE).toBe('답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.');
    await first.text();
  });

  it('claude 가 없으면 503', async () => {
    const response = await messageResponse(
      SID,
      post(`/api/prd-chat/sessions/${SID}/messages`, { message: '안녕' }),
      deps({ executable: join(dir, 'no-such-claude') }),
    );
    expect(response.status).toBe(503);
  });
});

describe('GET /api/prd-chat/drafts/[file]', () => {
  it('본문과 mtime(ISO)을 돌려준다', async () => {
    const path = join(root, 'docs', 'prd', 'fake-draft.md');
    writeFileSync(path, '---\ntype: prd\ntitle: 지어낸 초안\n---\n');
    const when = new Date('2026-10-01T01:02:03.000Z');
    utimesSync(path, when, when);
    const response = await draftResponse(
      'fake-draft.md',
      get('/api/prd-chat/drafts/fake-draft.md'),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      file: 'fake-draft.md',
      body: '---\ntype: prd\ntitle: 지어낸 초안\n---\n',
      updatedAt: when.toISOString(),
    });
  });

  it('받을 수 없는 이름은 400', async () => {
    for (const name of BAD_NAMES) {
      const response = await draftResponse(name, get('/api/prd-chat/drafts/x'), deps());
      expect(response.status, name).toBe(400);
    }
  });

  it('없는 파일은 404', async () => {
    const response = await draftResponse(
      'missing.md',
      get('/api/prd-chat/drafts/missing.md'),
      deps(),
    );
    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toHaveProperty('error');
  });
});

describe('POST /api/prd-chat/drafts/[file]/publish', () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });

  beforeEach(() => {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'fake@example.invalid');
    git('config', 'user.name', 'Fake');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'README.md'), '지어낸 레포\n');
    writeFileSync(join(root, 'docs', 'prd', 'fake-draft.md'), '---\ntitle: 지어낸 초안\n---\n');
    mkdirSync(join(root, 'docs', 'ledger'));
    writeFileSync(join(root, 'docs', 'ledger', '1.json'), '{}\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    // 가짜 pnpm 과 git: 받은 인자를 적고, prd:push 는 cli.ts 와 같은 세 줄을 뱉는다.
    script('pnpm', [
      `echo "pnpm $*" >> "${join(dir, 'calls')}"`,
      'if [ "$1" = "prd:push" ]; then',
      "  echo '이슈 #77 를 만들었습니다'",
      "  echo 'https://github.com/example/fake/issues/77'",
      "  echo '캐시: docs/prd/77-fake-draft.md'",
      'fi',
    ]);
    script('git', [`echo "git $*" >> "${join(dir, 'calls')}"`]);
  });

  const publish = (file = 'fake-draft.md') =>
    publishResponse(file, post(`/api/prd-chat/drafts/${file}/publish`, {}), deps());

  it('전제가 맞으면 다섯 단계가 NDJSON 으로 흐른다', async () => {
    // 추적 안 되는 파일과 docs/ledger/ 안의 변경은 막지 않는다.
    writeFileSync(join(root, 'untracked.txt'), '새 파일\n');
    writeFileSync(join(root, 'docs', 'ledger', '1.json'), '{"x":1}\n');
    const response = await publish();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const events = (await lines(response)) as { step: string; status: string }[];
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
    expect(events[1]).toMatchObject({
      issue: 77,
      url: 'https://github.com/example/fake/issues/77',
    });
  });

  it('main 이 아니면 409', async () => {
    git('checkout', '-q', '-b', 'prd/9');
    const response = await publish();
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain('main');
  });

  it('docs/ledger/ 밖에 추적되는 변경이 있으면 409', async () => {
    writeFileSync(join(root, 'README.md'), '고친 줄\n');
    const response = await publish();
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain('README.md');
  });

  it('받을 수 없는 이름은 400, 없는 파일은 404', async () => {
    for (const name of BAD_NAMES) {
      expect((await publish(name)).status, name).toBe(400);
    }
    expect((await publish('missing.md')).status).toBe(404);
  });
});

describe('mainCheckout', () => {
  it('워크트리에서도 본 체크아웃의 루트를 돌려준다', async () => {
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, stdio: 'pipe' });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'fake@example.invalid');
    git(root, 'config', 'user.name', 'Fake');
    git(root, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'README.md'), '지어낸 레포\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
    const tree = join(dir, 'tree');
    git(root, 'worktree', 'add', '-q', '-b', 'prd/9', tree);
    expect(await mainCheckout(tree)).toBe(root);
    expect(await mainCheckout(root)).toBe(root);
  });
});
