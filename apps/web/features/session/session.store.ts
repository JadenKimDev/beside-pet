/**
 * features/session/session.store.ts — session state + use cases (actions).
 * Feature-Sliced rules:
 *  - one store per feature (no per-screen view models); components subscribe via selectors.
 *  - one action = one use case (no UseCase classes).
 *    startSession / sendUserMessage ARE the "start session" / "send message" use cases.
 *  - flow/state here; components only render.
 *  - absence expressed with `undefined` only (no `null`).
 * The conversation language lives on the griefProfile (preferredLanguage), so the
 * session actions don't take a locale — the backend replies in the profile's language.
 *
 * Every stage, support level and "done" comes from the server (meta / done / state);
 * the store only records them on the message they arrived with, so the screen can draw
 * stage dividers and the crisis card at the right place without deciding anything.
 *
 * A user turn in flight is held as `turn`: once the server confirms it (`meta`) it can be
 * stopped (cancel → both bubbles go and the words return to the composer as `draft`).
 * Re-entering a session whose reply is still being made re-attaches to that turn's stream;
 * a turn whose reply failed after `meta` offers "get the reply again" (retry, no resend).
 *
 * Streamed replies go through a typewriter so the text renders at a calm, even
 * pace regardless of how bursty the SSE tokens arrive (see lib/stream/typewriter).
 */
import { create } from 'zustand';
import type { Message } from '@/components/chat/types';
import type { GriefProfile, SupportLevel, TaskId } from '@/lib/api';
import * as data from '@/lib/data';
import {
  attachTurn,
  consumeStream,
  dropTurn,
  followTurn,
  insertAfter,
  newId,
  now,
  runtime,
  sendTurn,
  sessionSnapshot,
  settleGreeting,
} from './session.turn';
import type { SessionStatus } from './session.types';

/** The user turn whose reply is coming in. `accepted`: the server confirmed it (`meta`), so it can be stopped. */
export interface TurnInFlight {
  turnId: string;
  userId?: string;
  botId: string;
  text: string;
  accepted: boolean;
}

export interface SessionState {
  sessionId?: string;
  /** Who the conversation is about, when known (onboarding profile or the session list). */
  petName?: string;
  messages: Message[];
  task: TaskId;
  progress: number; // 0..1
  supportLevel: SupportLevel;
  status: SessionStatus;
  streaming: boolean; // a reply is currently arriving / typing out
  /** Whether the mind report can be opened (server's `reportAvailable`), once closed. */
  reportAvailable: boolean;
  /** A wrap-up request is in flight. */
  closing: boolean;
  error?: string;
  /** The user turn whose reply is coming in (absent for the greeting and when idle). */
  turn?: TurnInFlight;
  /** A cancel request is in flight. */
  stopping: boolean;
  /** Words of a stopped turn, handed back to the composer; `key` changes once per stop. */
  draft?: { text: string; key: number };

  startSession: (griefProfile?: GriefProfile) => Promise<void>;
  /** Re-enters an existing session: loads its state + transcript, no greeting. */
  resumeSession: (sessionId: string, petName?: string) => Promise<void>;
  sendUserMessage: (text: string) => Promise<void>;
  /** Sends a message that failed again (it is removed and re-sent under its turn id). */
  resendMessage: (messageId: string) => Promise<void>;
  /** Stops the reply in flight; once the server confirms, the turn leaves the screen and its words return. */
  stopTurn: () => Promise<void>;
  /** Makes the reply of a turn the server received but could not answer again (no resend). */
  retryReply: (messageId: string) => Promise<void>;
  /** Ends the conversation (the wrap-up modal); the screen then shows the closed card. */
  wrapUp: () => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  sessionId: undefined,
  petName: undefined,
  messages: [] as Message[],
  task: 0 as TaskId,
  progress: 0,
  supportLevel: 1 as SupportLevel,
  status: 'idle' as SessionStatus,
  streaming: false,
  reportAvailable: false,
  closing: false,
  error: undefined,
  turn: undefined as TurnInFlight | undefined,
  stopping: false,
  draft: undefined as { text: string; key: number } | undefined,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...INITIAL,

  async startSession(griefProfile) {
    runtime.activeTyper?.cancel();
    runtime.activeTyper = undefined;
    runtime.generation += 1;
    const sessionId = newId();
    const botId = newId();
    set({
      ...INITIAL,
      sessionId,
      petName: griefProfile?.petName,
      messages: [{ id: botId, role: 'bot', text: '', streaming: true, at: now() }],
      status: 'active',
      streaming: true,
    });
    const outcome = await consumeStream(
      set,
      get,
      botId,
      undefined,
      data.startSessionStream(sessionId, griefProfile),
    );
    settleGreeting(set, botId, outcome);
  },

  async resumeSession(sessionId, petName) {
    runtime.activeTyper?.cancel();
    runtime.activeTyper = undefined;
    runtime.generation += 1;
    const mine = runtime.generation;
    set({ ...INITIAL, sessionId, petName });
    try {
      const { snapshot, activeTurn } = await sessionSnapshot(sessionId);
      if (mine !== runtime.generation) return;
      set(snapshot);
      // Not awaited: the screen is ready now; the reply keeps flowing in.
      if (activeTurn) void attachTurn(set, get, sessionId, activeTurn);
    } catch (error) {
      if (mine !== runtime.generation) return;
      set({ error: error instanceof Error ? error.message : 'Failed to resume the session.' });
    }
  },

  async sendUserMessage(text) {
    const { sessionId, status, streaming } = get();
    if (!sessionId || status === 'closed' || streaming) {
      return;
    }
    await sendTurn(set, get, text, newId());
  },

  async resendMessage(messageId) {
    const failed = get().messages.find((message) => message.id === messageId && message.failed);
    const { status, streaming } = get();
    if (!failed || streaming || status === 'closed') return;
    set((state) => ({ messages: state.messages.filter((message) => message.id !== messageId) }));
    // Same turn id: if an earlier try did reach the server, it answers 409 and the transcript is re-read.
    await sendTurn(set, get, failed.text, failed.turnId ?? newId());
  },

  async stopTurn() {
    const { sessionId, turn, stopping } = get();
    if (!sessionId || !turn?.accepted || stopping) return;
    const mine = runtime.generation;
    set({ stopping: true });
    try {
      await data.cancelTurn(sessionId, turn.turnId);
    } catch {
      if (mine !== runtime.generation) return;
      // The stream already ended on `cancelled` (the turn did stop): finish taking it off.
      if (get().turn?.botId !== turn.botId && get().streaming) return dropTurn(set, turn, true);
      // 409: the reply finished first, so it simply lands. Otherwise it keeps coming in.
      set({ stopping: false });
      return;
    }
    if (mine !== runtime.generation) return;
    // The stream may still carry tokens before its `cancelled`; it must not write any more.
    runtime.generation += 1;
    runtime.activeTyper?.cancel();
    runtime.activeTyper = undefined;
    dropTurn(set, turn, true);
  },

  async retryReply(messageId) {
    const { sessionId, status, streaming, messages } = get();
    const user = messages.find((message) => message.id === messageId && message.replyFailed);
    if (!sessionId || !user?.turnId || streaming || status === 'closed') return;
    const turn: TurnInFlight = {
      turnId: user.turnId,
      userId: user.id,
      botId: newId(),
      text: user.text,
      accepted: false,
    };
    set((state) => ({
      messages: insertAfter(
        state.messages.map((message) =>
          message.id === user.id ? { ...message, replyFailed: false } : message,
        ),
        user.id,
        { id: turn.botId, role: 'bot', text: '', streaming: true, at: now() },
      ),
      streaming: true,
      error: undefined,
      turn,
    }));
    await followTurn(set, get, sessionId, turn, data.retryTurnStream(sessionId, turn.turnId));
  },

  async wrapUp() {
    const { sessionId, closing } = get();
    if (!sessionId || closing) return;
    set({ closing: true });
    try {
      const state = await data.closeSession(sessionId);
      set((current) =>
        current.sessionId === sessionId
          ? { status: 'closed', reportAvailable: state.reportAvailable, closing: false }
          : { closing: false },
      );
    } catch (error) {
      set({ closing: false, error: error instanceof Error ? error.message : 'Failed to close.' });
      throw error;
    }
  },

  reset() {
    runtime.activeTyper?.cancel();
    runtime.activeTyper = undefined;
    runtime.generation += 1;
    set({ ...INITIAL });
  },
}));
