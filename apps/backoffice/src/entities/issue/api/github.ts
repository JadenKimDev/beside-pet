// 같은 출처의 개발노트 Route Handler(`app/api/github/`)를 부른다. 브라우저는 api.github.com 을 부르지 않는다.
// `@/shared/api` 의 `api` 는 `/v1/` 경로만 받으므로(서버 rewrites 전제) 여기서 따로 부르고, 오류는 같은 `ApiError` 로 던진다.
import { ApiError, errorMessage } from '@/shared/api';
import type { AddLabelResponse, BoardResponse, IssueDetail } from '../model/types';

const BASE = '/api/github';

function issuePath(number: number): string {
  if (!Number.isInteger(number) || number < 1) throw new Error(`invalid issue number: ${number}`);
  return `${BASE}/issues/${number}`;
}

async function request<Result>(
  method: 'GET' | 'POST',
  path: string,
  body?: object,
): Promise<Result> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = parseJson(text);
  // Route Handler 의 오류 본문은 `{ error }` 이고, errorMessage 가 그것을 꺼낸다.
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, parsed));
  return parsed as Result;
}

function parseJson(body: string): unknown {
  try {
    return body ? JSON.parse(body) : undefined;
  } catch {
    return undefined;
  }
}

/** 보드의 열 차례와 이 레포의 이슈 카드 전부(열린 것과 닫힌 것). */
export function fetchBoard(): Promise<BoardResponse> {
  return request<BoardResponse>('GET', `${BASE}/board`);
}

/** 이슈 하나의 본문(마크다운)과 댓글. */
export async function fetchIssue(number: number): Promise<IssueDetail> {
  return request<IssueDetail>('GET', issuePath(number));
}

/** 라벨 하나를 붙이고 그 이슈의 라벨 전부를 받는다. 붙일 수 있는 라벨은 Route Handler 의 허용 목록이 정한다. */
export async function addIssueLabel(number: number, label: string): Promise<AddLabelResponse> {
  return request<AddLabelResponse>('POST', `${issuePath(number)}/labels`, { label });
}
