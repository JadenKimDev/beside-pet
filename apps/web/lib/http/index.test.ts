import { afterEach, describe, expect, it, vi } from 'vitest';

const loadHttp = async () => {
  vi.resetModules();
  return (await import('./index')).http;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const stubFetch = () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('http base URL', () => {
  it('uses NEXT_PUBLIC_API_BASE_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
    const fetchMock = stubFetch();

    await (await loadHttp()).get('/v1/sessions');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/v1/sessions');
  });

  it('defaults to the local backend when unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
    const fetchMock = stubFetch();

    await (await loadHttp()).get('/v1/sessions');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/v1/sessions');
  });
});
