import { loadBoard } from './board';
import { GitHubError } from './client';
import { loadProjectConfig, ProjectConfigError } from './config';
import { ALLOWED_LABELS, addLabel, loadIssue } from './issue';
import type { GitHubErrorResponse } from './types';

/**
 * Route Handler(`app/api/github/...`)가 부르는 함수. 요청마다 토큰과 설정을 읽어 GitHub 를 부르고 `Response` 를
 * 돌려준다. 토큰은 서버 쪽 `GITHUB_TOKEN` 뿐이고 응답과 오류 문구에 싣지 않는다.
 */

export const TOKEN_MISSING_MESSAGE = 'GITHUB_TOKEN is not set';

const error = (status: number, message: string): Response =>
  Response.json({ error: message } satisfies GitHubErrorResponse, { status });

function failure(cause: unknown): Response {
  if (cause instanceof GitHubError) return error(cause.status, cause.message);
  if (cause instanceof ProjectConfigError) return error(500, cause.message);
  return error(502, 'GitHub request failed');
}

function issueNumber(raw: string): number | null {
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null;
}

type Context = { token: string; config: ReturnType<typeof loadProjectConfig> };

async function withGitHub(run: (context: Context) => Promise<unknown>): Promise<Response> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return error(503, TOKEN_MISSING_MESSAGE);
  try {
    return Response.json(await run({ token, config: loadProjectConfig() }));
  } catch (cause) {
    return failure(cause);
  }
}

export function getBoardResponse(): Promise<Response> {
  return withGitHub(({ config, token }) => loadBoard(config, token));
}

export async function getIssueResponse(rawNumber: string): Promise<Response> {
  if (!process.env.GITHUB_TOKEN?.trim()) return error(503, TOKEN_MISSING_MESSAGE);
  const number = issueNumber(rawNumber);
  if (number === null) return error(400, 'Invalid issue number');
  return withGitHub(({ config, token }) => loadIssue(config, token, number));
}

async function requestedLabel(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const label =
      body && typeof body === 'object' ? (body as { label?: unknown }).label : undefined;
    return typeof label === 'string' && ALLOWED_LABELS.includes(label) ? label : null;
  } catch {
    return null;
  }
}

export async function addLabelResponse(rawNumber: string, request: Request): Promise<Response> {
  if (!process.env.GITHUB_TOKEN?.trim()) return error(503, TOKEN_MISSING_MESSAGE);
  const number = issueNumber(rawNumber);
  if (number === null) return error(400, 'Invalid issue number');
  const label = await requestedLabel(request);
  if (label === null) return error(400, `Only ${ALLOWED_LABELS.join(', ')} can be added`);
  return withGitHub(({ config, token }) => addLabel(config, token, number, label));
}
