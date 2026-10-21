/**
 * 같은 출처의 `/v1/...` 만 부르는 fetch 래퍼. base URL 은 없다: Next 서버의 rewrites 가 API 로 넘긴다.
 * 쿠키 자격증명을 싣고, 서버의 Nest 모양 오류(`{ statusCode, message, error }`)를 `ApiError` 로 던진다.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 로그인이 없거나 끝났다(401). 호출자는 로그인 화면으로 보낸다. */
export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/** 로그인은 했지만 관리자가 아니다(403). 호출자는 권한 없음 화면을 보인다. */
export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}

/** Nest 모양 오류 본문에서 문구를 꺼낸다. 배열 문구는 쉼표로 잇고, 없으면 `error`, 그다음 상태 코드. */
export function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.map(String).join(', ');
    if (typeof error === 'string' && error) return error;
  }
  return `Request failed (${status})`;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<Result>(method: Method, path: string, body?: object): Promise<Result> {
  if (!path.startsWith('/v1/')) {
    throw new Error(`backoffice calls only same-origin /v1/ paths, got ${path}`);
  }
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = parseJson(text);
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, parsed));
  return (text ? parsed : undefined) as Result;
}

function parseJson(body: string): unknown {
  try {
    return body ? JSON.parse(body) : undefined;
  } catch {
    return undefined;
  }
}

export const api = {
  get: <Result>(path: string) => request<Result>('GET', path),
  post: <Result>(path: string, body?: object) => request<Result>('POST', path, body),
  patch: <Result>(path: string, body?: object) => request<Result>('PATCH', path, body),
  delete: <Result>(path: string) => request<Result>('DELETE', path),
};

/** 정의된 값만 질의 문자열로 붙인다. */
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
