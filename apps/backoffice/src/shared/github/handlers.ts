import { isAdminRequest } from './auth';
import { loadBoard } from './board';
import { GitHubError } from './client';
import { loadProjectConfig, ProjectConfigError } from './config';
import { ALLOWED_LABELS, addLabel, loadIssue } from './issue';
import type { GitHubErrorResponse } from './types';

/**
 * Route Handler(`app/api/github/...`)가 부르는 함수. 요청마다 토큰과 설정을 읽어 GitHub 를 부르고 `Response` 를
 * 돌려준다. 먼저 로그인한 관리자인지 서버에 묻는다(`auth.ts`). 토큰은 서버 쪽 `GITHUB_TOKEN` 뿐이고 응답과 오류 문구에 싣지 않는다.
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

/** 인증(관리자인가) 다음에 토큰을 본다. 막히면 오류 응답을, 통과하면 GitHub 토큰을 돌려준다. */
async function gate(request: Request): Promise<Response | string> {
  if (!(await isAdminRequest(request))) return error(401, 'Unauthorized');
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? token : error(503, TOKEN_MISSING_MESSAGE);
}

async function run(token: string, load: (context: Context) => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await load({ token, config: loadProjectConfig() }));
  } catch (cause) {
    return failure(cause);
  }
}

export async function getBoardResponse(request: Request): Promise<Response> {
  const token = await gate(request);
  if (token instanceof Response) return token;
  return run(token, ({ config }) => loadBoard(config, token));
}

export async function getIssueResponse(rawNumber: string, request: Request): Promise<Response> {
  const token = await gate(request);
  if (token instanceof Response) return token;
  const number = issueNumber(rawNumber);
  if (number === null) return error(400, 'Invalid issue number');
  return run(token, ({ config }) => loadIssue(config, token, number));
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
  const token = await gate(request);
  if (token instanceof Response) return token;
  const number = issueNumber(rawNumber);
  if (number === null) return error(400, 'Invalid issue number');
  const label = await requestedLabel(request);
  if (label === null) return error(400, `Only ${ALLOWED_LABELS.join(', ')} can be added`);
  return run(token, ({ config }) => addLabel(config, token, number, label));
}
