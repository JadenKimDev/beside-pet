import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from '@/shared/api';
import type { ChatEvent, PublishEvent } from '../model/types';
import { fetchDraft, openChatSession, publishDraft, sendChatMessage } from './prdChat';

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ndjson(lines: object[]): Response {
  return new Response(lines.map((line) => `${JSON.stringify(line)}\n`).join(''), {
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SESSION_ID = '0b9f2c1e-1111-4222-8333-444455556666';
const chatLines: ChatEvent[] = [
  { type: 'session', id: SESSION_ID },
  { type: 'text_delta', text: '무엇을 ' },
  { type: 'tool_use', name: 'Write', path: 'docs/prd/example.md' },
  { type: 'draft', file: 'example.md' },
  { type: 'result', ok: true },
];

describe('prd-draft api', () => {
  it('reads a draft with GET /api/prd-chat/drafts/{file}, encoding the name', async () => {
    const draft = { file: 'a b.md', body: '# 지어낸 초안', updatedAt: '2026-10-22T01:00:00.000Z' };
    const fetchMock = stub(() => Response.json(draft));

    await expect(fetchDraft('a b.md')).resolves.toEqual(draft);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prd-chat/drafts/a%20b.md');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('throws ApiError with the server text on 404', async () => {
    stub(() => Response.json({ error: '초안이 아직 없어요.' }, { status: 404 }));

    const error = await fetchDraft('missing.md').catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 404, message: '초안이 아직 없어요.' });
  });

  it('opens a session with POST /api/prd-chat/sessions and streams the events', async () => {
    const fetchMock = stub(() => ndjson(chatLines));
    const controller = new AbortController();

    const events = await openChatSession('지어낸 첫 메시지', controller.signal);
    await expect(collect(events)).resolves.toEqual(chatLines);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prd-chat/sessions');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ message: '지어낸 첫 메시지' }),
      signal: controller.signal,
    });
  });

  it('continues a session with POST /api/prd-chat/sessions/{id}/messages', async () => {
    const fetchMock = stub(() => ndjson(chatLines));

    await collect(await sendChatMessage(SESSION_ID, '다음 메시지'));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/prd-chat/sessions/${SESSION_ID}/messages`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ message: '다음 메시지' }),
    });
  });

  it('drops lines that are not chat events', async () => {
    stub(() => ndjson([{ type: 'session', id: SESSION_ID }, { type: 'unknown' }, { foo: 1 }]));

    await expect(collect(await openChatSession('x'))).resolves.toEqual([
      { type: 'session', id: SESSION_ID },
    ]);
  });

  it.each([
    [409, '답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.'],
    [503, '이 Mac 에 Claude Code 가 설치되어 있고 로그인돼 있어야 해요.'],
  ])('throws ApiError(%i) with the server text before streaming', async (status, text) => {
    stub(() => Response.json({ error: text }, { status }));

    const error = await sendChatMessage(SESSION_ID, 'x').catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status, message: text });
  });

  it('publishes with POST /api/prd-chat/drafts/{file}/publish and streams the steps', async () => {
    const lines: PublishEvent[] = [
      { step: 'push', status: 'running', output: '' },
      {
        step: 'push',
        status: 'ok',
        output: 'created',
        issue: 901,
        url: 'https://github.com/example/repo/issues/901',
      },
      { step: 'ledger', status: 'failed', output: 'boom' },
    ];
    const fetchMock = stub(() => ndjson([...lines, { step: 'nope', status: 'ok', output: '' }]));

    await expect(collect(await publishDraft('example.md'))).resolves.toEqual(lines);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prd-chat/drafts/example.md/publish');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('throws ApiError(409) with the precondition text on publish', async () => {
    const text =
      '본 체크아웃이 main 이 아니에요(지금 prd/1). 터미널에서 main 으로 옮긴 뒤 다시 눌러 주세요.';
    stub(() => Response.json({ error: text }, { status: 409 }));

    await expect(publishDraft('example.md')).rejects.toMatchObject({ status: 409, message: text });
  });
});
