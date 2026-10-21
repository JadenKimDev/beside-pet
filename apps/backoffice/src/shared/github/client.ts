/**
 * GitHub API 호출. Next 서버에서만 부른다. 토큰은 Authorization 머리에만 싣고 오류 문구에는 GitHub 의 `message`
 * 만 넘긴다.
 */

export const GITHUB_API = 'https://api.github.com';

export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

export type GitHubRequest = { token: string; method?: 'GET' | 'POST'; body?: object };

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function messageOf(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const { message } = body as { message?: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return `GitHub request failed (${status})`;
}

/** `path` 는 `/repos/...` 꼴. 성공하면 JSON 본문을, 실패하면 GitHub 의 상태 코드로 `GitHubError` 를 던진다. */
export async function githubJson<Result>(path: string, request: GitHubRequest): Promise<Result> {
  const { token, method = 'GET', body } = request;
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: headers(token),
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = parseJson(await response.text());
  if (!response.ok) throw new GitHubError(response.status, messageOf(response.status, parsed));
  return parsed as Result;
}

/** 응답 본문을 JSON 으로. 비었거나 JSON 이 아니면 undefined. */
function parseJson(body: string): unknown {
  try {
    return body ? JSON.parse(body) : undefined;
  } catch {
    return undefined;
  }
}

const PER_PAGE = 100;

/** `per_page=100` 과 `page` 를 따라가 목록을 모두 받는다. 100 개보다 적게 온 쪽이 마지막이다. */
export async function githubPages<Item>(
  path: string,
  query: Record<string, string>,
  token: string,
): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      ...query,
      per_page: String(PER_PAGE),
      page: String(page),
    });
    const batch = await githubJson<Item[]>(`${path}?${params}`, { token });
    items.push(...batch);
    if (batch.length < PER_PAGE) return items;
  }
}

/** GraphQL. 200 에 `errors` 가 오면 502 로 던진다. */
export async function githubGraphql<Data>(
  query: string,
  variables: Record<string, string | number | null>,
  token: string,
): Promise<Data> {
  const result = await githubJson<{ data?: Data | null; errors?: { message?: string }[] }>(
    '/graphql',
    { token, method: 'POST', body: { query, variables } },
  );
  const firstError = result.errors?.[0];
  if (firstError || !result.data) {
    throw new GitHubError(502, firstError?.message || 'GitHub GraphQL returned no data');
  }
  return result.data;
}
