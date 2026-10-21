import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, HttpError, isUnauthorized } from './client';

const BASE = 'http://api.test';

const jsonResponse = (status: number, body?: object): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response.clone());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const collect = async (frames: AsyncIterable<string>): Promise<string[]> => {
  const out: string[] = [];
  for await (const frame of frames) {
    out.push(frame);
  }
  return out;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createHttpClient', () => {
  it('joins baseUrl and path, sends cookies and JSON headers', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { ok: true }));
    const client = createHttpClient({ baseUrl: BASE });

    const result = await client.get<{ ok: boolean }>('/v1/sessions');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/sessions');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('serializes the body for post and patch, and omits it when absent', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}));
    const client = createHttpClient({ baseUrl: BASE });

    await client.post('/v1/things', { name: '보리' });
    await client.patch('/v1/things/1', { name: '콩이' });
    await client.post('/v1/things/1/close');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: '보리' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: '콩이' }),
    });
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty('body');
  });

  it('returns undefined for 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(client.delete('/v1/things/1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('uses a string error message as the Error text', async () => {
    stubFetch(jsonResponse(404, { message: 'Session not found' }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(client.get('/v1/sessions/x')).rejects.toThrow(
      new HttpError(404, 'Session not found'),
    );
  });

  it('joins an array error message with commas', async () => {
    stubFetch(
      jsonResponse(400, { message: ['text should not be empty', 'text must be a string'] }),
    );
    const client = createHttpClient({ baseUrl: BASE });

    await expect(client.post('/v1/sessions', {})).rejects.toThrow(
      new HttpError(400, 'text should not be empty, text must be a string'),
    );
  });

  it('falls back to the status when the body has no message', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal' }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(client.get('/v1/x')).rejects.toThrow(new HttpError(500, 'Request failed (500)'));
  });

  it('falls back to the status when the body is not JSON', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(client.get('/v1/x')).rejects.toThrow(new HttpError(502, 'Request failed (502)'));
  });

  it('carries the status on the thrown HttpError so callers can tell 401 apart', async () => {
    stubFetch(jsonResponse(401, { message: 'Account is unavailable' }));
    const client = createHttpClient({ baseUrl: BASE });

    const error = await client.get('/v1/sessions').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 401, message: 'Account is unavailable' });
    expect(isUnauthorized(error)).toBe(true);
  });

  it('isUnauthorized is false for other statuses and for non-HTTP errors', async () => {
    stubFetch(jsonResponse(503, { message: 'down' }));
    const client = createHttpClient({ baseUrl: BASE });

    const error = await client.get('/v1/sessions').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 503 });
    expect(isUnauthorized(error)).toBe(false);
    expect(isUnauthorized(new Error('Failed to fetch'))).toBe(false);
    expect(isUnauthorized(undefined)).toBe(false);
  });
});

describe('streamFrames', () => {
  it('POSTs with the SSE accept header and yields only data: payloads per frame', async () => {
    const fetchMock = stubFetch(
      sseResponse(['event: token\ndata: {"a":1}\n\n', ': comment\n\n', 'data:  two \n\n']),
    );
    const client = createHttpClient({ baseUrl: BASE });

    const frames = await collect(client.streamFrames('/v1/stream', { text: '안녕' }));

    expect(frames).toEqual(['{"a":1}', 'two']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/stream');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ text: '안녕' }),
    });
  });

  it('reassembles frames split across chunk boundaries', async () => {
    stubFetch(sseResponse(['da', 'ta: fir', 'st\n', '\ndata: sec', 'ond\n\ndata: third\n\n']));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(collect(client.streamFrames('/v1/stream'))).resolves.toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: 고마워\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });
    stubFetch(new Response(stream, { status: 200 }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(collect(client.streamFrames('/v1/stream'))).resolves.toEqual(['고마워']);
  });

  it('drops a trailing frame without the \\n\\n terminator', async () => {
    stubFetch(sseResponse(['data: done\n\ndata: partial']));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(collect(client.streamFrames('/v1/stream'))).resolves.toEqual(['done']);
  });

  it('throws with the status when the stream response is not ok', async () => {
    stubFetch(jsonResponse(401, { message: 'Unauthorized' }));
    const client = createHttpClient({ baseUrl: BASE });

    await expect(collect(client.streamFrames('/v1/stream'))).rejects.toThrow(
      new Error('Stream failed (401)'),
    );
  });
});

describe('onUnauthorized', () => {
  it('calls the registered handler on a 401, then still throws the HttpError', async () => {
    stubFetch(jsonResponse(401, { message: 'Account is unavailable' }));
    const client = createHttpClient({ baseUrl: BASE });
    const handler = vi.fn();
    client.onUnauthorized(handler);

    const error = await client.get('/v1/sessions').catch((caught: unknown) => caught);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 401 });
  });

  it('calls the handler when an SSE stream is refused with 401, then still throws', async () => {
    stubFetch(jsonResponse(401, { message: 'Unauthorized' }));
    const client = createHttpClient({ baseUrl: BASE });
    const handler = vi.fn();
    client.onUnauthorized(handler);

    await expect(collect(client.streamFrames('/v1/stream'))).rejects.toThrow('Stream failed (401)');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call the handler for other failing statuses', async () => {
    const client = createHttpClient({ baseUrl: BASE });
    const handler = vi.fn();
    client.onUnauthorized(handler);

    stubFetch(jsonResponse(403, { message: 'Forbidden' }));
    await expect(client.post('/v1/x', {})).rejects.toBeInstanceOf(HttpError);
    stubFetch(jsonResponse(500, { message: 'down' }));
    await expect(collect(client.streamFrames('/v1/stream'))).rejects.toThrow('Stream failed (500)');

    expect(handler).not.toHaveBeenCalled();
  });

  it('throws the HttpError as before once the handler is cleared', async () => {
    stubFetch(jsonResponse(401, { message: 'Unauthorized' }));
    const client = createHttpClient({ baseUrl: BASE });
    const handler = vi.fn();
    client.onUnauthorized(handler);
    client.onUnauthorized(undefined);

    await expect(client.get('/v1/sessions')).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });
});
