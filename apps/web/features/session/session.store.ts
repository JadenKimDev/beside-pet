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
 * Streamed replies go through a typewriter so the text renders at a calm, even
 * pace regardless of how bursty the SSE tokens arrive (see lib/stream/typewriter).
 */
import { create } from 'zustand';
import type { Message } from '@/components/chat/types';
import type { GriefProfile, StreamEvent, SupportLevel, TaskId, TurnResult } from '@/lib/api';
import * as data from '@/lib/data';
import { createTypewriter, type Typewriter } from '@/lib/stream/typewriter';
import type { SessionStatus } from './session.types';

interface SessionState {
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

  startSession: (griefProfile?: GriefProfile) => Promise<void>;
  /** Re-enters an existing session: loads its state + transcript, no greeting. */
  resumeSession: (sessionId: string, petName?: string) => Promise<void>;
  sendUserMessage: (text: string) => Promise<void>;
  /** Sends a message that failed again (it is removed and re-sent as new). */
  resendMessage: (messageId: string) => Promise<void>;
  /** Ends the conversation (the wrap-up modal); the screen then shows the closed card. */
  wrapUp: () => Promise<void>;
  reset: () => void;
}

const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}`;
const now = (): string => new Date().toISOString();

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
};

type SetState = (
  partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>),
) => void;

/** The typewriter for the in-flight reply, so reset() can cancel mid-type. */
let activeTyper: Typewriter | undefined;
/** Bumped by reset/resume so a stream from a conversation already left cannot write. */
let generation = 0;

const patchMessage = (set: SetState, id: string, patch: Partial<Message>): void => {
  set((state) => ({
    messages: state.messages.map((message) =>
      message.id === id ? { ...message, ...patch } : message,
    ),
  }));
};

/** Asks the server whether the report opens, after the conversation closed. */
const loadReportAvailability = async (set: SetState, sessionId: string): Promise<void> => {
  try {
    const state = await data.getSessionState(sessionId);
    set((current) =>
      current.sessionId === sessionId ? { reportAvailable: state.reportAvailable } : {},
    );
  } catch {
    // Without the answer the report button simply stays hidden.
  }
};

/**
 * Drives one streamed turn: structure (meta) updates immediately, tokens feed
 * the typewriter, and the authoritative TurnResult is applied once the text has
 * finished typing out. Resolves when the bot message is fully rendered.
 * A stream that fails before any text marks the user's message as not sent.
 */
const consumeStream = (
  set: SetState,
  get: () => SessionState,
  botId: string,
  userId: string | undefined,
  stream: AsyncIterable<StreamEvent>,
): Promise<void> =>
  new Promise((resolve) => {
    const mine = generation;
    const live = () => mine === generation;
    let result: TurnResult | undefined;
    let received = false;

    const typer = createTypewriter({
      onText: (visible) => {
        if (live()) patchMessage(set, botId, { text: visible });
      },
      onComplete: () => {
        activeTyper = undefined;
        if (!live()) return resolve();
        const closed = result?.done === true;
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === botId
              ? {
                  ...message,
                  streaming: false,
                  ...(result ? { task: result.task, supportLevel: result.supportLevel } : {}),
                }
              : message,
          ),
          streaming: false,
          ...(result
            ? {
                task: result.task,
                progress: result.progress,
                supportLevel: result.supportLevel,
                status: (closed ? 'closed' : 'active') as SessionStatus,
              }
            : {}),
        }));
        const sessionId = get().sessionId;
        if (closed && sessionId) void loadReportAvailability(set, sessionId);
        resolve();
      },
    });
    activeTyper = typer;

    (async () => {
      try {
        for await (const event of stream) {
          if (!live()) break;
          if (event.kind === 'meta') {
            set({ task: event.task, progress: event.progress, supportLevel: event.supportLevel });
            patchMessage(set, botId, { task: event.task, supportLevel: event.supportLevel });
          } else if (event.kind === 'token') {
            received = true;
            typer.push(event.text);
          } else {
            result = event.result;
          }
        }
        typer.finish();
      } catch (error) {
        typer.cancel();
        activeTyper = undefined;
        if (live()) {
          set((state) => ({
            // Nothing arrived: drop the empty reply and mark the user's message as not sent.
            // Part of a reply arrived: keep what was said; the server already has the turn.
            messages: received
              ? state.messages.map((message) =>
                  message.id === botId ? { ...message, streaming: false } : message,
                )
              : state.messages
                  .filter((message) => message.id !== botId)
                  .map((message) =>
                    message.id === userId ? { ...message, failed: true } : message,
                  ),
            streaming: false,
            error: error instanceof Error ? error.message : 'Stream failed.',
          }));
        }
        resolve();
      }
    })();
  });

export const useSessionStore = create<SessionState>((set, get) => ({
  ...INITIAL,

  async startSession(griefProfile) {
    activeTyper?.cancel();
    activeTyper = undefined;
    generation += 1;
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
    await consumeStream(
      set,
      get,
      botId,
      undefined,
      data.startSessionStream(sessionId, griefProfile),
    );
  },

  async resumeSession(sessionId, petName) {
    activeTyper?.cancel();
    activeTyper = undefined;
    generation += 1;
    const mine = generation;
    set({ ...INITIAL, sessionId, petName });
    try {
      const [state, history] = await Promise.all([
        data.getSessionState(sessionId),
        data.getMessages(sessionId),
      ]);
      if (mine !== generation) return;
      const lastBot = history.map((message) => message.role).lastIndexOf('assistant');
      set({
        messages: history.map((message, index) => ({
          id: `history-${index}`,
          role: message.role === 'user' ? 'user' : 'bot',
          text: message.text,
          at: message.at,
          task: message.task,
          // History carries no per-message level; the session's level belongs to its last reply.
          ...(index === lastBot ? { supportLevel: state.supportLevel } : {}),
        })),
        task: state.task,
        progress: state.progress,
        supportLevel: state.supportLevel,
        status: state.closed ? 'closed' : 'active',
        reportAvailable: state.reportAvailable,
      });
    } catch (error) {
      if (mine !== generation) return;
      set({ error: error instanceof Error ? error.message : 'Failed to resume the session.' });
    }
  },

  async sendUserMessage(text) {
    const { sessionId, status, streaming, task } = get();
    if (!sessionId || status === 'closed' || streaming) {
      return;
    }
    const userId = newId();
    const botId = newId();
    set((state) => ({
      messages: [
        ...state.messages,
        { id: userId, role: 'user', text, at: now(), task },
        { id: botId, role: 'bot', text: '', streaming: true, at: now() },
      ],
      streaming: true,
      error: undefined,
    }));
    await consumeStream(set, get, botId, userId, data.sendMessageStream(sessionId, text));
  },

  async resendMessage(messageId) {
    const failed = get().messages.find((message) => message.id === messageId && message.failed);
    if (!failed || get().streaming) return;
    set((state) => ({ messages: state.messages.filter((message) => message.id !== messageId) }));
    await get().sendUserMessage(failed.text);
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
    activeTyper?.cancel();
    activeTyper = undefined;
    generation += 1;
    set({ ...INITIAL });
  },
}));
