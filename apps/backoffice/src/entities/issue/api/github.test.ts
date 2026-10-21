import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from '@/shared/api';
import { addIssueLabel, fetchBoard, fetchIssue } from './github';

function stub(response: () => Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const board = {
  columns: ['Backlog', 'In progress', 'In review', 'Done'],
  cards: [
    {
      number: 901,
      title: '예시 이슈',
      labels: [],
      updatedAt: '2026-10-20T01:00:00Z',
      state: 'open',
      column: 'Backlog',
      url: 'https://github.com/example/repo/issues/901',
    },
  ],
};

const detail = {
  number: 901,
  title: '예시 이슈',
  state: 'open',
  labels: [],
  body: '## 요약\n지어낸 본문',
  url: 'https://github.com/example/repo/issues/901',
  createdAt: '2026-10-19T00:00:00Z',
  updatedAt: '2026-10-20T01:00:00Z',
  comments: [
    { id: 1, author: 'example-bot', body: '지어낸 댓글', createdAt: '2026-10-20T02:00:00Z' },
  ],
};

describe('issue api', () => {
  it('reads the board with GET /api/github/board on the same origin', async () => {
    const fetchMock = stub(() => Response.json(board));

    await expect(fetchBoard()).resolves.toEqual(board);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/github/board');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('reads one issue with GET /api/github/issues/{number}', async () => {
    const fetchMock = stub(() => Response.json(detail));

    await expect(fetchIssue(901)).resolves.toEqual(detail);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/github/issues/901');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('adds a label with POST and { label } as the body', async () => {
    const labels = [{ name: 'run:implement', color: 'ededed' }];
    const fetchMock = stub(() => Response.json({ labels }));

    await expect(addIssueLabel(901, 'run:implement')).resolves.toEqual({ labels });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/github/issues/901/labels');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ label: 'run:implement' }),
    });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('rejects an issue number that is not a positive integer without calling', async () => {
    const fetchMock = stub(() => Response.json(detail));

    await expect(fetchIssue(0)).rejects.toThrow();
    await expect(fetchIssue(1.5)).rejects.toThrow();
    await expect(addIssueLabel(-3, 'run:implement')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws ApiError with the { error } text and status on failure', async () => {
    stub(() => Response.json({ error: 'Issue not found' }, { status: 404 }));

    const error = await fetchIssue(404).catch((caught: unknown) => caught);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 404, message: 'Issue not found' });
  });

  it('throws ApiError with the status when the body is not JSON', async () => {
    stub(() => new Response('<html>bad gateway</html>', { status: 502 }));

    await expect(fetchBoard()).rejects.toMatchObject({ status: 502 });
  });
});
