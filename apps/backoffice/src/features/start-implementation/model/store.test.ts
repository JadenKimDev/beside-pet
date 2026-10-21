import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStartImplementationStore, START_IMPLEMENTATION_TEXT } from './store';

const labels = [{ name: 'run:implement', color: 'ededed' }];

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('start-implementation store', () => {
  it('starts idle', () => {
    expect(createStartImplementationStore().getState()).toMatchObject({
      status: 'idle',
      error: null,
      labels: null,
    });
  });

  it('posts run:implement and goes pending → done with the new labels', async () => {
    const fetchMock = stub(() => Response.json({ labels }));
    const store = createStartImplementationStore();

    const running = store.getState().start(901);
    expect(store.getState().status).toBe('pending');
    await expect(running).resolves.toEqual(labels);

    expect(store.getState()).toMatchObject({ status: 'done', error: null, labels });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/github/issues/901/labels');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ label: 'run:implement' }),
    });
  });

  it('ignores another start while pending and after done', async () => {
    const fetchMock = stub(() => Response.json({ labels }));
    const store = createStartImplementationStore();

    const first = store.getState().start(901);
    await expect(store.getState().start(901)).resolves.toBeNull();
    await first;
    await expect(store.getState().start(901)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('goes to error with the server text after a prefix', async () => {
    stub(() => Response.json({ error: 'Label is not allowed' }, { status: 400 }));
    const store = createStartImplementationStore();

    await expect(store.getState().start(901)).resolves.toBeNull();

    expect(store.getState()).toMatchObject({
      status: 'error',
      error: `${START_IMPLEMENTATION_TEXT.failedPrefix}Label is not allowed`,
      labels: null,
    });
  });

  it('tells the token is missing on 503 GITHUB_TOKEN is not set', async () => {
    stub(() => Response.json({ error: 'GITHUB_TOKEN is not set' }, { status: 503 }));
    const store = createStartImplementationStore();

    await store.getState().start(901);

    expect(store.getState()).toMatchObject({
      status: 'error',
      error: START_IMPLEMENTATION_TEXT.tokenMissing,
    });
  });

  it('shows the retry text when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const store = createStartImplementationStore();

    await store.getState().start(901);

    expect(store.getState()).toMatchObject({
      status: 'error',
      error: START_IMPLEMENTATION_TEXT.networkFailed,
    });
  });

  it('can retry after an error and clears the error when it starts', async () => {
    stub(() => Response.json({ error: 'Bad gateway' }, { status: 502 }));
    const store = createStartImplementationStore();
    await store.getState().start(901);

    stub(() => Response.json({ labels }));
    const retry = store.getState().start(901);
    expect(store.getState()).toMatchObject({ status: 'pending', error: null });
    await retry;

    expect(store.getState()).toMatchObject({ status: 'done', labels });
  });
});
