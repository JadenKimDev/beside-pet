import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, isForbidden, isUnauthorized, withQuery } from './index';

const jsonResponse = (status: number, body?: object): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response.clone());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const caught = async (promise: Promise<object | undefined>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('calls the same-origin relative path with cookies and JSON headers', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { ok: true }));

    await expect(api.get<{ ok: boolean }>('/v1/auth/me')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/v1/auth/me');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    expect(init).not.toHaveProperty('body');
  });

  it('serializes the JSON body for post and patch', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}));

    await api.post('/v1/admin/accounts', { email: 'qa@example.test' });
    await api.patch('/v1/admin/accounts/1', { status: 'suspended' });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: 'qa@example.test' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ status: 'suspended' }),
    });
  });

  it('returns undefined for 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(api.delete('/v1/admin/accounts/1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('refuses paths outside same-origin /v1/', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}));

    await expect(api.get('http://127.0.0.1:3000/v1/auth/me')).rejects.toThrow(/\/v1\//);
    await expect(api.get('/api/x')).rejects.toThrow(/\/v1\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ApiError', () => {
  it('carries the status and the Nest-shaped string message', async () => {
    stubFetch(
      jsonResponse(403, { statusCode: 403, message: 'Insufficient role', error: 'Forbidden' }),
    );

    const error = await caught(api.get('/v1/admin/metrics/models'));

    expect(error.status).toBe(403);
    expect(error.message).toBe('Insufficient role');
  });

  it('joins an array message with commas', async () => {
    stubFetch(
      jsonResponse(400, {
        statusCode: 400,
        message: ['from must be a valid ISO 8601 date string', 'property x should not exist'],
        error: 'Bad Request',
      }),
    );

    const error = await caught(api.get('/v1/admin/metrics/models?from=x'));

    expect(error.status).toBe(400);
    expect(error.message).toBe(
      'from must be a valid ISO 8601 date string, property x should not exist',
    );
  });

  it('falls back to the error field, then to the status', async () => {
    stubFetch(jsonResponse(500, { statusCode: 500, error: 'Internal Server Error' }));
    expect((await caught(api.get('/v1/x'))).message).toBe('Internal Server Error');

    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const error = await caught(api.get('/v1/x'));
    expect(error.status).toBe(502);
    expect(error.message).toBe('Request failed (502)');
  });
});

describe('isUnauthorized / isForbidden', () => {
  it('tells 401 and 403 apart and ignores other errors', () => {
    expect(isUnauthorized(new ApiError(401, 'Unauthorized'))).toBe(true);
    expect(isForbidden(new ApiError(401, 'Unauthorized'))).toBe(false);
    expect(isForbidden(new ApiError(403, 'Insufficient role'))).toBe(true);
    expect(isUnauthorized(new ApiError(403, 'Insufficient role'))).toBe(false);
    expect(isUnauthorized(new Error('network'))).toBe(false);
    expect(isForbidden(null)).toBe(false);
  });
});

describe('withQuery', () => {
  it('appends defined params and skips undefined ones', () => {
    expect(
      withQuery('/v1/admin/metrics/models', { from: '2026-10-01T00:00:00.000Z', to: undefined }),
    ).toBe('/v1/admin/metrics/models?from=2026-10-01T00%3A00%3A00.000Z');
    expect(withQuery('/v1/admin/accounts', {})).toBe('/v1/admin/accounts');
    expect(withQuery('/v1/x', { page: 2, q: 'a b' })).toBe('/v1/x?page=2&q=a+b');
  });
});
