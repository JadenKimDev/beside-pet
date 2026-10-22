// 같은 출처의 PRD 채팅 Route Handler(`app/api/prd-chat/`)를 부른다. `@/shared/api` 의 `api` 는 `/v1/` 경로만 받으므로
// 여기서 따로 부르고, 비 2xx 는 `{ error }` 를 꺼내 같은 `ApiError` 로 던진다. 스트림은 시작 전의 오류만 던지고,
// 그 뒤는 줄마다 이벤트로 낸다(흐르다 끊긴 것은 서버가 마지막 줄 `error` 로 알린다).
import { ApiError, errorMessage } from '@/shared/api';
import { readNdjson } from '../lib/readNdjson';
import type { ChatEvent, PrdDraft, PublishEvent } from '../model/types';
import { PUBLISH_STEPS } from '../model/types';

const BASE = '/api/prd-chat';

function draftUrl(file: string): string {
  return `${BASE}/drafts/${encodeURIComponent(file)}`;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: object,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, errorMessage(response.status, parseJson(text)));
  }
  return response;
}

function parseJson(body: string): unknown {
  try {
    return body ? JSON.parse(body) : undefined;
  } catch {
    return undefined;
  }
}

async function* events<Event>(
  response: Response,
  isEvent: (body: unknown) => body is Event,
): AsyncGenerator<Event> {
  if (!response.body) return;
  for await (const value of readNdjson(response.body)) {
    if (isEvent(value)) yield value;
  }
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (!isObject(value)) return false;
  switch (value.type) {
    case 'session':
      return typeof value.id === 'string';
    case 'text_delta':
      return typeof value.text === 'string';
    case 'tool_use':
      return typeof value.name === 'string';
    case 'draft':
      return typeof value.file === 'string';
    case 'result':
      return typeof value.ok === 'boolean';
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
  }
}

const STEP_SET: ReadonlySet<string> = new Set(PUBLISH_STEPS);
const STATUS_SET: ReadonlySet<string> = new Set(['running', 'ok', 'failed']);

function isPublishEvent(value: unknown): value is PublishEvent {
  return (
    isObject(value) &&
    typeof value.step === 'string' &&
    STEP_SET.has(value.step) &&
    typeof value.status === 'string' &&
    STATUS_SET.has(value.status) &&
    typeof value.output === 'string'
  );
}

/** 초안 하나를 읽는다. 없으면 `ApiError(404)`, 이름이 틀리면 `ApiError(400)`. */
export async function fetchDraft(file: string, signal?: AbortSignal): Promise<PrdDraft> {
  const response = await call('GET', draftUrl(file), undefined, signal);
  return response.json();
}

/** 새 세션을 연다. 첫 이벤트는 `{ type: 'session', id }`. 시작 전에 막히면 `ApiError`(403·400·503·500)를 던진다. */
export async function openChatSession(
  message: string,
  signal?: AbortSignal,
): Promise<AsyncIterable<ChatEvent>> {
  return events(await call('POST', `${BASE}/sessions`, { message }, signal), isChatEvent);
}

/** 세션을 잇는다. 그 세션에 답이 흐르는 중이면 `ApiError(409)`. */
export async function sendChatMessage(
  sessionId: string,
  message: string,
  signal?: AbortSignal,
): Promise<AsyncIterable<ChatEvent>> {
  const path = `${BASE}/sessions/${encodeURIComponent(sessionId)}/messages`;
  return events(await call('POST', path, { message }, signal), isChatEvent);
}

/** 초안을 이슈로 올리는 다섯 단계를 돌린다. 전제가 어긋나면 `ApiError(409)` 이고 문구는 화면에 그대로 보여도 된다. */
export async function publishDraft(
  file: string,
  signal?: AbortSignal,
): Promise<AsyncIterable<PublishEvent>> {
  return events(await call('POST', `${draftUrl(file)}/publish`, undefined, signal), isPublishEvent);
}
