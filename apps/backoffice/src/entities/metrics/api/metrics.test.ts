import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchConversationMetrics, fetchModelMetrics } from './metrics';

function stub(body: object) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json(body, { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const period = { from: '2026-10-14T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' };

describe('metrics api', () => {
  it('reads model metrics with from and to as the query', async () => {
    const body = { ...period, models: [], daily: [] };
    const fetchMock = stub(body);

    await expect(fetchModelMetrics(period)).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/v1/admin/metrics/models?from=2026-10-14T00%3A00%3A00.000Z&to=2026-10-21T00%3A00%3A00.000Z',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('leaves out an empty side so the server default applies', async () => {
    const fetchMock = stub({ ...period, daily: [] });

    await fetchConversationMetrics({ from: period.from });
    await fetchConversationMetrics({});
    await fetchConversationMetrics();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/admin/metrics/conversations?from=2026-10-14T00%3A00%3A00.000Z',
      '/v1/admin/metrics/conversations',
      '/v1/admin/metrics/conversations',
    ]);
  });
});
