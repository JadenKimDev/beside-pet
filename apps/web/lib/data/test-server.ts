// 테스트 전용: 방법과 경로로 답을 고르는 가짜 fetch. 부른 요청을 차례로 적어 둔다.
import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
}

type Reply = { status: number; body?: object };

export function fakeServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    calls.push({ method, path });
    const reply = routes[`${method} ${path}`];
    if (!reply) {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    count: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path).length,
  };
}
