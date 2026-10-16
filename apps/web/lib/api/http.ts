/**
 * lib/api/http.ts — real backend client.
 * Implements the Api port against beside-pet-api over the
 * shared transport (lib/http): base URL, cookie credentials, and error
 * extraction live there. What stays here is this port's own concern — routes,
 * and validating each SSE frame into a StreamEvent at the boundary.
 */
import { http } from '@/lib/http';
import type {
  Api,
  HistoryMessage,
  MindReport,
  SessionListItem,
  SessionStateView,
  StartRequest,
  StreamEvent,
  TurnResult,
} from './types';

/** JSON.parse returns `any`; this alias pins the boundary to a checkable shape. */
const parseJson: (text: string) => object | null = JSON.parse;

const isStreamEvent = (value: object): value is StreamEvent =>
  'kind' in value && (value.kind === 'meta' || value.kind === 'token' || value.kind === 'done');

/** Parses one SSE frame payload into a StreamEvent (validated at this boundary). */
function asStreamEvent(payload: string): StreamEvent | undefined {
  const parsed = parseJson(payload);
  if (parsed === null || !isStreamEvent(parsed)) {
    return undefined;
  }
  return parsed;
}

/** Yields the turn's events, dropping frames that aren't a known StreamEvent. */
async function* streamTurn(path: string, body: object): AsyncIterable<StreamEvent> {
  for await (const payload of http.streamFrames(path, body)) {
    const event = asStreamEvent(payload);
    if (event) {
      yield event;
    }
  }
}

export const httpApi: Api = {
  start(request: StartRequest): Promise<TurnResult> {
    return http.post('/v1/sessions', request);
  },

  sendMessage(sessionId: string, text: string): Promise<TurnResult> {
    return http.post(`/v1/sessions/${sessionId}/messages`, { text });
  },

  startStream(request: StartRequest): AsyncIterable<StreamEvent> {
    return streamTurn('/v1/sessions/stream', request);
  },

  sendMessageStream(sessionId: string, text: string): AsyncIterable<StreamEvent> {
    return streamTurn(`/v1/sessions/${sessionId}/messages/stream`, { text });
  },

  listSessions(): Promise<SessionListItem[]> {
    return http.get('/v1/sessions');
  },

  getSessionState(sessionId: string): Promise<SessionStateView> {
    return http.get(`/v1/sessions/${sessionId}`);
  },

  getMessages(sessionId: string): Promise<HistoryMessage[]> {
    return http.get(`/v1/sessions/${sessionId}/messages`);
  },

  getReport(sessionId: string): Promise<MindReport> {
    return http.get(`/v1/sessions/${sessionId}/report`);
  },

  closeSession(sessionId: string): Promise<SessionStateView> {
    return http.post(`/v1/sessions/${sessionId}/close`);
  },

  deleteSession(sessionId: string): Promise<void> {
    return http.delete(`/v1/sessions/${sessionId}`);
  },
};
