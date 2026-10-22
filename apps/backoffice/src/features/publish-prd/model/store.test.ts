import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublishPrdStore } from './store';
import { PUBLISH_PRD_TEXT } from './texts';

const URL_901 = 'https://github.com/example/repo/issues/901';
const STEPS = ['push', 'ledger', 'commit', 'git-push', 'worktree'] as const;

function ndjson(lines: object[]): Response {
  return new Response(lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
}

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const allOk = STEPS.map((step) =>
  step === 'push'
    ? { step, status: 'ok', output: 'pushed', issue: 901, url: URL_901 }
    : { step, status: 'ok', output: `${step} ok` },
);

describe('publish-prd store', () => {
  it('posts the publish and goes done with the issue and url', async () => {
    const fetchMock = stub(() => ndjson(allOk));
    const store = createPublishPrdStore();

    await store.getState().publish('example.md');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prd-chat/drafts/example.md/publish');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(store.getState()).toMatchObject({ status: 'done', issue: 901, url: URL_901 });
  });

  it('ignores publish while running and after done', async () => {
    const fetchMock = stub(() => ndjson(allOk));
    const store = createPublishPrdStore();

    const first = store.getState().publish('example.md');
    expect(store.getState().status).toBe('running');
    await store.getState().publish('example.md');
    await first;
    await store.getState().publish('example.md');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('goes failed at the failing step', async () => {
    stub(() =>
      ndjson([allOk[0], { step: 'ledger', status: 'failed', output: '지어낸 실패 출력' }]),
    );
    const store = createPublishPrdStore();
    await store.getState().publish('example.md');
    expect(store.getState()).toMatchObject({ status: 'failed', issue: 901 });
    expect(store.getState().steps.map((s) => s.status)).toEqual([
      'ok',
      'failed',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('shows the 409 text as-is and can try again', async () => {
    const text = '본 체크아웃에 docs/ledger/ 밖의 커밋하지 않은 변경이 있어요: a.ts';
    stub(() => Response.json({ error: text }, { status: 409 }));
    const store = createPublishPrdStore();
    await store.getState().publish('example.md');
    expect(store.getState()).toMatchObject({ status: 'error', error: text });

    stub(() => ndjson(allOk));
    await store.getState().publish('example.md');
    expect(store.getState()).toMatchObject({ status: 'done', error: null });
  });

  it('shows the default text on other failures and on a cut stream', async () => {
    stub(() => Response.json({ error: 'x' }, { status: 500 }));
    const store = createPublishPrdStore();
    await store.getState().publish('example.md');
    expect(store.getState()).toMatchObject({ status: 'error', error: PUBLISH_PRD_TEXT.failed });

    stub(() => ndjson([{ step: 'push', status: 'running', output: '' }]));
    await store.getState().publish('example.md');
    expect(store.getState()).toMatchObject({
      status: 'error',
      error: PUBLISH_PRD_TEXT.interrupted,
    });
  });
});
