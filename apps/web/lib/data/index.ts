/**
 * lib/data — the app's single gateway to backend data.
 * UI and stores call THIS, never lib/api or lib/cache directly. Caching lives
 * only here: each cached read owns a createCache instance + its keys + its
 * invalidation, co-located. Mutations call the api and invalidate affected caches.
 *
 * Today there are only mutations (the live conversation), so nothing is cached
 * yet. Cached reads (session history, profile, …) slot in here. Example:
 *
 *   const historyCache = createCache<SessionSummary[]>(60_000);
 *   export async function getHistory(userId: string): Promise<SessionSummary[]> {
 *     const cached = historyCache.get(userId);
 *     if (cached) return cached;
 *     const fresh = await api.getHistory(userId);
 *     historyCache.set(userId, fresh);
 *     return fresh;
 *   }
 *   // startSession() would then call historyCache.invalidate(userId).
 */
import type {
  CancelledTurn,
  DeletedSessionItem,
  GriefProfile,
  HistoryMessage,
  MindReport,
  SessionListItem,
  SessionStateView,
  StreamEvent,
  TurnResult,
} from '@/lib/api';
import { api } from '@/lib/api';

export { isServerRefusal, isTurnAlreadyReceived } from '@/lib/api';

import { createCache } from '@/lib/cache/cache';

/** `griefProfile` present = first-time (onboarding); omitted = continue from history. */
export function startSession(sessionId: string, griefProfile?: GriefProfile): Promise<TurnResult> {
  return api.start({ sessionId, griefProfile });
}

export function sendMessage(sessionId: string, text: string, turnId?: string): Promise<TurnResult> {
  return api.sendMessage(sessionId, text, turnId);
}

export function startSessionStream(
  sessionId: string,
  griefProfile?: GriefProfile,
): AsyncIterable<StreamEvent> {
  return api.startStream({ sessionId, griefProfile });
}

/** `turnId` is the client-made idempotency key; resending the same id answers 409. */
export function sendMessageStream(
  sessionId: string,
  text: string,
  turnId?: string,
): AsyncIterable<StreamEvent> {
  return api.sendMessageStream(sessionId, text, turnId);
}

export function streamTurn(sessionId: string, turnId: string): AsyncIterable<StreamEvent> {
  return api.streamTurn(sessionId, turnId);
}

export function cancelTurn(sessionId: string, turnId: string): Promise<CancelledTurn> {
  return api.cancelTurn(sessionId, turnId);
}

export function retryTurnStream(sessionId: string, turnId: string): AsyncIterable<StreamEvent> {
  return api.retryTurnStream(sessionId, turnId);
}

export function listSessions(): Promise<SessionListItem[]> {
  return api.listSessions();
}

export function getSessionState(sessionId: string): Promise<SessionStateView> {
  return api.getSessionState(sessionId);
}

export function getMessages(sessionId: string): Promise<HistoryMessage[]> {
  return api.getMessages(sessionId);
}

// Mind report: the backend now writes it once and stores it with the session,
// so this cache only saves a round trip, not a model call. Key = sessionId.
const reportCache = createCache<MindReport>(10 * 60_000);

export async function getReport(sessionId: string): Promise<MindReport> {
  const cached = reportCache.get(sessionId);
  if (cached) {
    return cached;
  }
  const fresh = await api.getReport(sessionId);
  reportCache.set(sessionId, fresh);
  return fresh;
}

/** Ends an ongoing session (idempotent). Invalidates its cached report. */
export async function closeSession(sessionId: string): Promise<SessionStateView> {
  const state = await api.closeSession(sessionId);
  reportCache.invalidate(sessionId);
  return state;
}

// The two lists (sessions, trash) are not cached: every mutation below moves a row
// between them or flips its report flag, so a fresh read is the only correct one.

/** Moves a session to the trash and drops any copy of its report held here. */
export async function deleteSession(sessionId: string): Promise<void> {
  await api.deleteSession(sessionId);
  reportCache.invalidate(sessionId);
}

export function listDeletedSessions(): Promise<DeletedSessionItem[]> {
  return api.listDeletedSessions();
}

/** Brings a session back from the trash; its report is read fresh next time. */
export async function restoreSession(sessionId: string): Promise<SessionStateView> {
  const state = await api.restoreSession(sessionId);
  reportCache.invalidate(sessionId);
  return state;
}

/** Deletes a session's report (the conversation stays) and drops the copy held here. */
export async function deleteReport(sessionId: string): Promise<void> {
  await api.deleteReport(sessionId);
  reportCache.invalidate(sessionId);
}

/** Brings a deleted report back; the returned report is the cached copy from now on. */
export async function restoreReport(sessionId: string): Promise<MindReport> {
  const report = await api.restoreReport(sessionId);
  reportCache.set(sessionId, report);
  return report;
}
