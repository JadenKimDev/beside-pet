/**
 * `/api/github/*` 는 운영자만 쓴다. 요청의 로그인 쿠키를 서버의 `GET /v1/auth/me` 에 보내 관리자인지 묻는다.
 * 같은 브라우저의 다른 사이트가 보낸 요청(쿠키 없음)과 관리자가 아닌 계정은 여기서 막는다. 판정은 서버다.
 * API 주소는 `next.config.ts` 의 rewrites 와 같은 `API_BASE_URL` 이고 기본값도 같다. 쿠키 값은 로그와 응답에 싣지 않는다.
 */

const SESSION_COOKIE = 'beside-pet.token';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

function sessionCookie(request: Request): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const value = rest.join('=');
    if (name === SESSION_COOKIE && value) return value;
  }
  return null;
}

/** 로그인한 관리자의 요청인가. 쿠키가 없거나, 서버가 거절하거나, 닿지 않으면 `false` 다. */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const value = sessionCookie(request);
  if (value === null) return false;
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${value}` },
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const me = (await response.json()) as { role?: string } | null;
    return me?.role === 'admin';
  } catch {
    return false;
  }
}
