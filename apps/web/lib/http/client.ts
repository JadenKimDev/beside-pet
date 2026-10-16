/**
 * lib/http/client.ts — the app's HTTP transport.
 * A factory (not a base class): callers receive a client that closes over the
 * base URL and the shared policy — httpOnly cookie credentials, JSON headers,
 * and error messages lifted from the backend's response body. Swapping the
 * transport means passing a different client, not extending a class.
 *
 * This layer stays domain-agnostic: it moves JSON and SSE frames. Validating a
 * frame into a domain event belongs to the caller (see lib/api/http.ts).
 */

export interface HttpClientOptions {
  baseUrl: string;
}

export interface HttpClient {
  get<Result>(path: string): Promise<Result>;
  /** `body` is any JSON-serializable object; omit it for bodiless calls. */
  post<Result>(path: string, body?: object): Promise<Result>;
  patch<Result>(path: string, body?: object): Promise<Result>;
  delete<Result>(path: string): Promise<Result>;
  /** Opens an SSE POST and yields each frame's `data:` payload, still raw. */
  streamFrames(path: string, body?: object): AsyncIterable<string>;
}

/** Shape of the backend's error responses (NestJS puts the reason in `message`). */
interface ErrorBody {
  message?: string | string[];
}

/** Lifts the backend's own message so users see the reason, not just a status. */
const extractError = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as ErrorBody;
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // fall through to the status
  }
  return `Request failed (${res.status})`;
};

export function createHttpClient({ baseUrl }: HttpClientOptions): HttpClient {
  const send = async <Result>(path: string, init: RequestInit): Promise<Result> => {
    const res = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    if (res.status === 204) {
      return undefined as Result;
    }
    return (await res.json()) as Result;
  };

  const withBody = (method: string, body?: object): RequestInit => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  async function* streamFrames(path: string, body?: object): AsyncIterable<string> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const payload = frame.split('\n').find((part) => part.startsWith('data:'));
        if (payload) {
          yield payload.slice('data:'.length).trim();
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  return {
    get: (path) => send(path, { method: 'GET' }),
    post: (path, body) => send(path, withBody('POST', body)),
    patch: (path, body) => send(path, withBody('PATCH', body)),
    delete: (path) => send(path, { method: 'DELETE' }),
    streamFrames,
  };
}
