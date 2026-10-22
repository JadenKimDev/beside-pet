import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrdChatStore, type KeyValueStorage, PRD_CHAT_STORAGE_KEYS } from './store';
import { PRD_CHAT_TEXT } from './texts';

const SESSION_ID = '0b9f2c1e-1111-4222-8333-444455556666';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

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

const turn = [
  { type: 'session', id: SESSION_ID },
  { type: 'text_delta', text: '초안을 ' },
  { type: 'text_delta', text: '썼어요' },
  { type: 'draft', file: 'example.md' },
  { type: 'result', ok: true },
];

describe('prd-chat store', () => {
  it('opens a session on the first send, then continues it, and saves ids to storage', async () => {
    const fetchMock = stub(() => ndjson(turn));
    const storage = memoryStorage();
    const store = createPrdChatStore({ storage });

    await expect(store.getState().send('첫 메시지')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prd-chat/sessions');
    expect(store.getState()).toMatchObject({
      status: 'idle',
      sessionId: SESSION_ID,
      draftFile: 'example.md',
      messages: [
        { role: 'user', text: '첫 메시지' },
        { role: 'assistant', text: '초안을 썼어요' },
      ],
    });
    expect(storage.map.get(PRD_CHAT_STORAGE_KEYS.sessionId)).toBe(SESSION_ID);
    expect(storage.map.get(PRD_CHAT_STORAGE_KEYS.draftFile)).toBe('example.md');

    await store.getState().send('둘째');
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/prd-chat/sessions/${SESSION_ID}/messages`);
    expect(store.getState().messages).toHaveLength(4);
  });

  it('ignores send while streaming and blank messages', async () => {
    let release: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = createPrdChatStore({ storage: null });

    const first = store.getState().send('첫');
    expect(store.getState().status).toBe('streaming');
    await expect(store.getState().send('또')).resolves.toBe(false);
    await expect(store.getState().send('   ')).resolves.toBe(false);
    release(ndjson(turn));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, '답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.'],
    [503, '이 Mac 에 Claude Code 가 설치되어 있고 로그인돼 있어야 해요.'],
  ])('shows the server text on %i and takes back the user message', async (status, text) => {
    stub(() => Response.json({ error: text }, { status }));
    const store = createPrdChatStore({ storage: null });

    await expect(store.getState().send('보낼 글')).resolves.toBe(false);
    expect(store.getState()).toMatchObject({ status: 'error', error: text, messages: [] });
  });

  it('shows the default text on other failures', async () => {
    stub(() => Response.json({ error: 'claude 를 띄우지 못했어요.' }, { status: 500 }));
    const store = createPrdChatStore({ storage: null });
    await store.getState().send('보낼 글');
    expect(store.getState()).toMatchObject({ status: 'error', error: PRD_CHAT_TEXT.noAnswer });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await store.getState().send('보낼 글');
    expect(store.getState()).toMatchObject({ status: 'error', error: PRD_CHAT_TEXT.noAnswer });
  });

  it('shows the forbidden text on 403', async () => {
    stub(() => Response.json({ error: 'Forbidden' }, { status: 403 }));
    const store = createPrdChatStore({ storage: null });
    await store.getState().send('보낼 글');
    expect(store.getState().error).toBe(PRD_CHAT_TEXT.forbidden);
  });

  it('turns a stream that ends without result into an error and keeps the answer so far', async () => {
    stub(() => ndjson(turn.slice(0, 2)));
    const store = createPrdChatStore({ storage: null });
    await expect(store.getState().send('첫')).resolves.toBe(true);
    expect(store.getState()).toMatchObject({ status: 'error', error: PRD_CHAT_TEXT.noAnswer });
    expect(store.getState().messages).toHaveLength(2);
  });

  it('restore reads the session id and the draft file back from storage', () => {
    const storage = memoryStorage({
      [PRD_CHAT_STORAGE_KEYS.sessionId]: SESSION_ID,
      [PRD_CHAT_STORAGE_KEYS.draftFile]: 'example.md',
    });
    const store = createPrdChatStore({ storage });
    expect(store.getState().sessionId).toBeNull();

    store.getState().restore();
    expect(store.getState()).toMatchObject({ sessionId: SESSION_ID, draftFile: 'example.md' });
  });

  it('continues a restored session with the messages endpoint', async () => {
    const fetchMock = stub(() => ndjson(turn));
    const storage = memoryStorage({ [PRD_CHAT_STORAGE_KEYS.sessionId]: SESSION_ID });
    const store = createPrdChatStore({ storage });
    store.getState().restore();

    await store.getState().send('이어서');
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/prd-chat/sessions/${SESSION_ID}/messages`);
  });

  it('reset clears the state and the storage', async () => {
    stub(() => ndjson(turn));
    const storage = memoryStorage();
    const store = createPrdChatStore({ storage });
    await store.getState().send('첫');

    store.getState().reset();
    expect(store.getState()).toMatchObject({
      messages: [],
      sessionId: null,
      draftFile: null,
      status: 'idle',
      error: null,
    });
    expect(storage.map.size).toBe(0);
  });

  it('works without storage when there is no window', async () => {
    stub(() => ndjson(turn));
    const store = createPrdChatStore();
    store.getState().restore();
    await store.getState().send('첫');
    expect(store.getState().sessionId).toBe(SESSION_ID);
  });
});
