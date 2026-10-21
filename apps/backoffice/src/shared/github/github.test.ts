import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLabelResponse,
  type BoardResponse,
  clearGitHubCache,
  getBoardResponse,
  getIssueResponse,
  type IssueDetailResponse,
  loadProjectConfig,
} from './index';

// 지어낸 레포와 보드. 실제 레포의 project.config.json 은 쓰지 않는다.
const FAKE_CONFIG = { repo: 'fake-owner/fake-repo', ghUser: 'fake-owner', boardNumber: 7 };
const TOKEN = 'test-token-not-real';

let root: string;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Call = { url: string; init: RequestInit };
type Route = (url: URL, init: RequestInit) => Response | undefined;

/** 가짜 fetch: 경로별로 응답을 돌려주고 부른 것을 적어 둔다. 맞는 경로가 없으면 실패한다. */
const API_ME = 'http://127.0.0.1:3000/v1/auth/me';
const COOKIE = 'beside-pet.token=fake-session-value';

/** `/v1/auth/me` 의 가짜 답. 기본은 관리자다. */
type Me = () => Response;
const admin: Me = () => json(200, { id: 'acc-1', username: 'fake-admin', role: 'admin' });

const stubGitHub = (route: Route, me: Me = admin) => {
  const calls: Call[] = [];
  const meCalls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/auth/me') {
      meCalls.push({ url: url.toString(), init });
      return me();
    }
    calls.push({ url: url.toString(), init });
    const response = route(url, init);
    if (!response) throw new Error(`unexpected request ${init.method ?? 'GET'} ${url}`);
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  // GitHub 로 간 요청 수만 센다(`/v1/auth/me` 는 meCalls).
  const githubCalls = () => calls.length;
  return { calls, meCalls, githubCalls };
};

/** 로그인 쿠키를 실은 요청. */
const signedIn = (path = '/api/github/board', init: RequestInit = {}) =>
  new Request(`http://127.0.0.1:3002${path}`, {
    ...init,
    headers: { cookie: `other=1; ${COOKIE}`, ...(init.headers as Record<string, string>) },
  });

const restIssue = (number: number, overrides: object = {}) => ({
  number,
  title: `지어낸 이슈 ${number}`,
  state: 'open',
  labels: [{ name: 'prd', color: 'ededed' }],
  updated_at: '2026-01-02T03:04:05Z',
  created_at: '2026-01-01T00:00:00Z',
  html_url: `https://github.com/fake-owner/fake-repo/issues/${number}`,
  body: `# 본문 ${number}`,
  ...overrides,
});

const boardItem = (number: number, status: string | null, repo = 'fake-owner/fake-repo') => ({
  fieldValueByName: status === null ? null : { name: status },
  content: { number, repository: { nameWithOwner: repo } },
});

const graphqlBoard = (nodes: object[], pageInfo = { hasNextPage: false, endCursor: null }) =>
  json(200, { data: { user: { projectV2: { items: { pageInfo, nodes } } } } });

const isGraphql = (url: URL) => url.pathname === '/graphql';
const isIssueList = (url: URL) => url.pathname === '/repos/fake-owner/fake-repo/issues';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'github-config-'));
  writeFileSync(join(root, 'project.config.json'), JSON.stringify(FAKE_CONFIG));
  const nested = join(root, 'apps', 'backoffice');
  mkdirSync(nested, { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(nested);
  vi.stubEnv('GITHUB_TOKEN', TOKEN);
  clearGitHubCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('loadProjectConfig', () => {
  it('walks up from the start directory to the repo root config', () => {
    expect(loadProjectConfig(join(root, 'apps', 'backoffice'))).toEqual({
      owner: 'fake-owner',
      repo: 'fake-repo',
      boardOwner: 'fake-owner',
      boardNumber: 7,
    });
  });

  it('fails when no project.config.json is found', () => {
    const empty = mkdtempSync(join(tmpdir(), 'github-noconfig-'));
    try {
      expect(() => loadProjectConfig(empty)).toThrow(/project\.config\.json/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('auth', () => {
  const anonymous = (path: string, init: RequestInit = {}) =>
    new Request(`http://127.0.0.1:3002${path}`, init);
  const labelBody = { method: 'POST', body: '{"label":"run:implement"}' };

  const allRoutes = (request: (path: string, init?: RequestInit) => Request) => [
    () => getBoardResponse(request('/api/github/board')),
    () => getIssueResponse('5', request('/api/github/issues/5')),
    () => addLabelResponse('5', request('/api/github/issues/5/labels', labelBody)),
  ];

  const expectUnauthorized = async (responses: Response[]) => {
    for (const response of responses) {
      expect(response.status).toBe(401);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: 'Unauthorized' });
      expect(text).not.toContain('fake-session-value');
      expect(text).not.toContain(TOKEN);
    }
  };

  it('answers 401 without a session cookie and calls neither the API nor GitHub', async () => {
    const { githubCalls, meCalls } = stubGitHub(() => undefined);

    await expectUnauthorized(await Promise.all(allRoutes(anonymous).map((run) => run())));

    expect(meCalls).toHaveLength(0);
    expect(githubCalls()).toBe(0);
  });

  it('answers 401 for a viewer', async () => {
    const { githubCalls } = stubGitHub(
      () => undefined,
      () => json(200, { id: 'acc-2', username: 'fake-viewer', role: 'viewer' }),
    );

    await expectUnauthorized(await Promise.all(allRoutes(signedIn).map((run) => run())));

    expect(githubCalls()).toBe(0);
  });

  it('answers 401 when /v1/auth/me rejects the session', async () => {
    for (const status of [401, 403]) {
      const { githubCalls } = stubGitHub(
        () => undefined,
        () => json(status, { statusCode: status, message: 'Unauthorized' }),
      );

      await expectUnauthorized(await Promise.all(allRoutes(signedIn).map((run) => run())));

      expect(githubCalls()).toBe(0);
    }
  });

  it('answers 401 when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expectUnauthorized(await Promise.all(allRoutes(signedIn).map((run) => run())));
  });

  it('checks the session cookie against API_BASE_URL/v1/auth/me before GitHub', async () => {
    vi.stubEnv('API_BASE_URL', 'http://127.0.0.1:8000/');
    const { meCalls, calls } = stubGitHub((url) => {
      if (isIssueList(url)) return json(200, []);
      if (isGraphql(url)) return graphqlBoard([]);
      return undefined;
    });

    const response = await getBoardResponse(signedIn());

    expect(response.status).toBe(200);
    expect(meCalls).toHaveLength(1);
    expect(meCalls[0]?.url).toBe('http://127.0.0.1:8000/v1/auth/me');
    expect(meCalls[0]?.init.headers).toEqual({ cookie: COOKIE });
    expect(calls.length).toBeGreaterThan(0);
  });

  it('uses the default API address when API_BASE_URL is not set', async () => {
    vi.stubEnv('API_BASE_URL', '');
    const { meCalls } = stubGitHub((url) => {
      if (isIssueList(url)) return json(200, []);
      if (isGraphql(url)) return graphqlBoard([]);
      return undefined;
    });

    await getBoardResponse(signedIn());

    expect(meCalls[0]?.url).toBe(API_ME);
  });

  it('checks the session before the GitHub token', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    stubGitHub(() => undefined);

    await expectUnauthorized(await Promise.all(allRoutes(anonymous).map((run) => run())));
  });
});

describe('token', () => {
  it('answers 503 without calling GitHub when GITHUB_TOKEN is not set', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const { githubCalls } = stubGitHub(() => undefined);

    for (const response of [
      await getBoardResponse(signedIn()),
      await getIssueResponse('3', signedIn()),
      await addLabelResponse(
        '3',
        signedIn('/api/github/issues/3/labels', {
          method: 'POST',
          body: '{"label":"run:implement"}',
        }),
      ),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'GITHUB_TOKEN is not set' });
    }
    expect(githubCalls()).toBe(0);
  });

  it('sends the token only in the Authorization header and never echoes it in errors', async () => {
    const { calls } = stubGitHub((url) => {
      if (url.pathname.endsWith('/issues/9')) return json(404, { message: 'Not Found' });
      if (url.pathname.endsWith('/issues/9/comments')) return json(404, { message: 'Not Found' });
      return undefined;
    });

    const response = await getIssueResponse('9', signedIn());

    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'Not Found' });
    expect(text).not.toContain(TOKEN);
  });
});

describe('board', () => {
  it('maps board status to columns, keeps issues off the board with column null and skips pull requests', async () => {
    const { calls } = stubGitHub((url) => {
      if (isIssueList(url)) {
        return json(200, [
          restIssue(1),
          restIssue(2, { state: 'closed' }),
          restIssue(3),
          restIssue(4, { pull_request: { url: 'x' } }),
        ]);
      }
      if (isGraphql(url)) {
        return graphqlBoard([
          boardItem(1, 'In progress'),
          boardItem(2, 'Done'),
          boardItem(1, 'Backlog', 'someone/else'),
          { fieldValueByName: null, content: {} },
        ]);
      }
      return undefined;
    });

    const response = await getBoardResponse(signedIn());
    expect(response.status).toBe(200);
    const board = (await response.json()) as BoardResponse;

    expect(board.columns).toEqual(['Backlog', 'In progress', 'In review', 'Done']);
    expect(board.cards).toEqual([
      {
        number: 1,
        title: '지어낸 이슈 1',
        labels: [{ name: 'prd', color: 'ededed' }],
        updatedAt: '2026-01-02T03:04:05Z',
        state: 'open',
        column: 'In progress',
        url: 'https://github.com/fake-owner/fake-repo/issues/1',
      },
      expect.objectContaining({ number: 2, state: 'closed', column: 'Done' }),
      expect.objectContaining({ number: 3, column: null }),
    ]);

    const list = new URL(calls.find((call) => isIssueList(new URL(call.url)))!.url);
    expect(list.searchParams.get('state')).toBe('all');
    expect(list.searchParams.get('per_page')).toBe('100');
    expect(list.searchParams.get('page')).toBe('1');
  });

  it('queries Projects v2 with the board owner, number and the Status field name', async () => {
    const { calls } = stubGitHub((url) => {
      if (isIssueList(url)) return json(200, []);
      if (isGraphql(url)) return graphqlBoard([]);
      return undefined;
    });

    await getBoardResponse(signedIn());

    const call = calls.find((c) => isGraphql(new URL(c.url)))!;
    expect(call.url).toBe('https://api.github.com/graphql');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    const payload = JSON.parse(String(call.init.body));
    expect(payload.query).toMatch(/user\(login: \$login\)/);
    expect(payload.query).toMatch(/projectV2\(number: \$number\)/);
    expect(payload.query).toMatch(/fieldValueByName\(name: \$statusField\)/);
    expect(payload.variables).toEqual({
      login: 'fake-owner',
      number: 7,
      statusField: 'Status',
      after: null,
    });
  });

  it('follows REST pages of 100 and GraphQL cursors until the end', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => restIssue(i + 1));
    const page2 = [restIssue(101), restIssue(102)];
    const graphqlAfter: (string | null)[] = [];
    const { calls } = stubGitHub((url, init) => {
      if (isIssueList(url)) {
        const page = url.searchParams.get('page');
        if (page === '1') return json(200, page1);
        if (page === '2') return json(200, page2);
        return undefined;
      }
      if (isGraphql(url)) {
        const { after } = JSON.parse(String(init.body)).variables;
        graphqlAfter.push(after);
        return after === null
          ? graphqlBoard([boardItem(1, 'Backlog')], { hasNextPage: true, endCursor: 'c1' } as never)
          : graphqlBoard([boardItem(102, 'In review')]);
      }
      return undefined;
    });

    const board = (await (await getBoardResponse(signedIn())).json()) as BoardResponse;

    expect(board.cards).toHaveLength(102);
    expect(board.cards.find((c) => c.number === 1)?.column).toBe('Backlog');
    expect(board.cards.find((c) => c.number === 102)?.column).toBe('In review');
    expect(calls.filter((c) => isIssueList(new URL(c.url)))).toHaveLength(2);
    expect(graphqlAfter).toEqual([null, 'c1']);
  });

  it('passes GraphQL errors on as a bad gateway', async () => {
    stubGitHub((url) => {
      if (isIssueList(url)) return json(200, []);
      if (isGraphql(url))
        return json(200, { data: null, errors: [{ message: 'Could not resolve' }] });
      return undefined;
    });

    const response = await getBoardResponse(signedIn());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Could not resolve' });
  });

  it('caches the board for 60 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { githubCalls } = stubGitHub((url) => {
      if (isIssueList(url)) return json(200, [restIssue(1)]);
      if (isGraphql(url)) return graphqlBoard([]);
      return undefined;
    });

    await getBoardResponse(signedIn());
    expect(githubCalls()).toBe(2);

    vi.advanceTimersByTime(59_000);
    await getBoardResponse(signedIn());
    expect(githubCalls()).toBe(2);

    vi.advanceTimersByTime(2_000);
    await getBoardResponse(signedIn());
    expect(githubCalls()).toBe(4);
  });
});

describe('issue detail', () => {
  it('returns the markdown body and all comment pages', async () => {
    const comments1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      user: { login: 'fake-bot' },
      body: `댓글 ${i + 1} ![shot](https://example.test/${i}.png)`,
      created_at: '2026-01-03T00:00:00Z',
    }));
    const comments2 = [{ id: 101, user: null, body: '마지막', created_at: '2026-01-04T00:00:00Z' }];
    const { calls } = stubGitHub((url) => {
      if (url.pathname === '/repos/fake-owner/fake-repo/issues/5') return json(200, restIssue(5));
      if (url.pathname === '/repos/fake-owner/fake-repo/issues/5/comments') {
        return json(200, url.searchParams.get('page') === '1' ? comments1 : comments2);
      }
      return undefined;
    });

    const response = await getIssueResponse('5', signedIn());
    expect(response.status).toBe(200);
    const detail = (await response.json()) as IssueDetailResponse;

    expect(detail).toMatchObject({
      number: 5,
      title: '지어낸 이슈 5',
      state: 'open',
      body: '# 본문 5',
      url: 'https://github.com/fake-owner/fake-repo/issues/5',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T03:04:05Z',
      labels: [{ name: 'prd', color: 'ededed' }],
    });
    expect(detail.comments).toHaveLength(101);
    expect(detail.comments[0]).toEqual({
      id: 1,
      author: 'fake-bot',
      body: '댓글 1 ![shot](https://example.test/0.png)',
      createdAt: '2026-01-03T00:00:00Z',
    });
    expect(detail.comments[100]).toEqual({
      id: 101,
      author: null,
      body: '마지막',
      createdAt: '2026-01-04T00:00:00Z',
    });
    const commentCalls = calls.filter((c) => c.url.includes('/comments'));
    expect(commentCalls.map((c) => new URL(c.url).searchParams.get('per_page'))).toEqual([
      '100',
      '100',
    ]);
  });

  it('turns a null body into an empty string', async () => {
    stubGitHub((url) => {
      if (url.pathname.endsWith('/issues/6')) return json(200, restIssue(6, { body: null }));
      if (url.pathname.endsWith('/issues/6/comments')) return json(200, []);
      return undefined;
    });

    const detail = (await (await getIssueResponse('6', signedIn())).json()) as IssueDetailResponse;

    expect(detail.body).toBe('');
  });

  it('rejects a non-numeric issue number with 400 and no GitHub call', async () => {
    const { githubCalls } = stubGitHub(() => undefined);

    for (const bad of ['abc', '0', '-1', '1.5', '1/comments']) {
      const response = await getIssueResponse(bad, signedIn());
      expect(response.status).toBe(400);
    }
    expect(githubCalls()).toBe(0);
  });
});

describe('labels', () => {
  const post = (body: unknown) =>
    signedIn('/api/github/issues/5/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('adds run:implement with POST and the labels array', async () => {
    const { calls } = stubGitHub((url, init) =>
      url.pathname === '/repos/fake-owner/fake-repo/issues/5/labels' && init.method === 'POST'
        ? json(200, [
            { name: 'prd', color: 'ededed' },
            { name: 'run:implement', color: '0e8a16' },
          ])
        : undefined,
    );

    const response = await addLabelResponse('5', post({ label: 'run:implement' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      labels: [
        { name: 'prd', color: 'ededed' },
        { name: 'run:implement', color: '0e8a16' },
      ],
    });
    expect(calls[0]?.url).toBe('https://api.github.com/repos/fake-owner/fake-repo/issues/5/labels');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ labels: ['run:implement'] });
  });

  it('refuses labels outside the allow list without calling GitHub', async () => {
    const { githubCalls } = stubGitHub(() => undefined);

    for (const body of [{ label: 'bug' }, { label: ['run:implement'] }, {}, 'not json']) {
      const response = await addLabelResponse('5', post(body));
      expect(response.status).toBe(400);
    }
    expect(githubCalls()).toBe(0);
  });

  it('clears the cache so the next board read goes to GitHub', async () => {
    const { githubCalls } = stubGitHub((url, init) => {
      if (isIssueList(url)) return json(200, [restIssue(5)]);
      if (isGraphql(url)) return graphqlBoard([]);
      if (url.pathname.endsWith('/issues/5/labels') && init.method === 'POST') return json(200, []);
      return undefined;
    });

    await getBoardResponse(signedIn());
    await getBoardResponse(signedIn());
    expect(githubCalls()).toBe(2);

    await addLabelResponse('5', post({ label: 'run:implement' }));
    await getBoardResponse(signedIn());
    expect(githubCalls()).toBe(5);
  });
});
