/**
 * features/session-archive/session-archive.store.ts — past sessions: the list,
 * one session's transcript, and its mind report. Separate from features/session,
 * which owns the live conversation: browsing records and holding a conversation
 * have different lifecycles.
 *
 * Feature-Sliced rules: one store per feature, one action = one use case,
 * components only render and subscribe via selectors. Navigation stays in the
 * pages — this store knows nothing about the router.
 *
 * Because a store is a module singleton (unlike component state), two guards
 * replace what per-mount state gave for free:
 *  - entering a session clears the previous one, so no stale record flashes;
 *  - each load carries a token, so a slow response from a session the user
 *    already left can never overwrite the current one.
 * A single route renders each of these at a time, so one slot per concern is
 * enough (no keying by id).
 */
import { create } from 'zustand';
import type { HistoryMessage, MindReport, SessionListItem, SessionStateView } from '@/lib/api';
import * as data from '@/lib/data';
import type { LoadStatus, ReportStatus } from './session-archive.types';

interface SessionArchiveState {
  items?: SessionListItem[];
  listStatus: LoadStatus;

  /** The session currently held in the detail slot (transcript view). */
  detailId?: string;
  detail?: SessionStateView;
  transcript?: HistoryMessage[];
  detailStatus: LoadStatus;

  /** The session currently held in the report slot. */
  reportId?: string;
  report?: MindReport;
  reportStatus: ReportStatus;

  /** A mutation (ending a session) is in flight. */
  busy: boolean;

  loadList: () => Promise<void>;
  loadDetail: (sessionId: string) => Promise<void>;
  loadReport: (sessionId: string) => Promise<void>;
  /** Ends an ongoing conversation; the list is refreshed on its next load. */
  endSession: (sessionId: string) => Promise<void>;
  /** Erases a conversation for good, then reloads the list. */
  removeSession: (sessionId: string) => Promise<void>;
}

/** Load tokens: only the newest request for each slot may write its result. */
let listToken = 0;
let detailToken = 0;
let reportToken = 0;

export const useSessionArchiveStore = create<SessionArchiveState>((set) => ({
  items: undefined,
  listStatus: 'idle',
  detailId: undefined,
  detail: undefined,
  transcript: undefined,
  detailStatus: 'idle',
  reportId: undefined,
  report: undefined,
  reportStatus: 'idle',
  busy: false,

  async loadList() {
    const token = ++listToken;
    set({ listStatus: 'loading' });
    try {
      const items = await data.listSessions();
      if (token !== listToken) return;
      set({ items, listStatus: 'ready' });
    } catch {
      if (token !== listToken) return;
      set({ items: undefined, listStatus: 'failed' });
    }
  },

  async loadDetail(sessionId) {
    const token = ++detailToken;
    set({
      detailId: sessionId,
      detail: undefined,
      transcript: undefined,
      detailStatus: 'loading',
    });
    try {
      const [detail, transcript] = await Promise.all([
        data.getSessionState(sessionId),
        data.getMessages(sessionId),
      ]);
      if (token !== detailToken) return;
      set({ detail, transcript, detailStatus: 'ready' });
    } catch {
      if (token !== detailToken) return;
      set({ detailStatus: 'failed' });
    }
  },

  async loadReport(sessionId) {
    const token = ++reportToken;
    set({ reportId: sessionId, report: undefined, reportStatus: 'loading' });
    try {
      const state = await data.getSessionState(sessionId);
      if (token !== reportToken) return;
      if (!state.reportAvailable) {
        set({ detail: state, detailId: sessionId, reportStatus: 'unavailable' });
        return;
      }
      const report = await data.getReport(sessionId);
      if (token !== reportToken) return;
      set({ detail: state, detailId: sessionId, report, reportStatus: 'ready' });
    } catch {
      if (token !== reportToken) return;
      set({ reportStatus: 'failed' });
    }
  },

  async endSession(sessionId) {
    set({ busy: true });
    try {
      await data.closeSession(sessionId);
      // The list is stale now; the next visit reloads it.
      set({ items: undefined, listStatus: 'idle' });
    } finally {
      set({ busy: false });
    }
  },

  async removeSession(sessionId) {
    set({ busy: true });
    try {
      await data.deleteSession(sessionId);
      // Drop anything still held about it, then show the remaining list.
      set((state) => ({
        detail: state.detailId === sessionId ? undefined : state.detail,
        transcript: state.detailId === sessionId ? undefined : state.transcript,
        report: state.reportId === sessionId ? undefined : state.report,
      }));
      await useSessionArchiveStore.getState().loadList();
    } finally {
      set({ busy: false });
    }
  },
}));
