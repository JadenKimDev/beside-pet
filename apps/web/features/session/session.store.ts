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
  messages: Message[];
  task: TaskId;
  progress: number; // 0..1
  supportLevel: SupportLevel;
  status: SessionStatus;
  streaming: boolean; // a reply is currently arriving / typing out
  error?: string;

  startSession: (griefProfile?: GriefProfile) => Promise<void>;
  /** Re-enters an existing session: loads its state + transcript, no greeting. */
  resumeSession: (sessionId: string) => Promise<void>;
  sendUserMessage: (text: string) => Promise<void>;
  reset: () => void;
}

const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}`;
const userMessage = (text: string): Message => ({ id: newId(), role: 'user', text });

const INITIAL = {
  sessionId: undefined,
  messages: [] as Message[],
  task: 0 as TaskId,
  progress: 0,
  supportLevel: 1 as SupportLevel,
  status: 'idle' as SessionStatus,
  streaming: false,
  error: undefined,
};

type SetState = (
  partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>),
) => void;

/** The typewriter for the in-flight reply, so reset() can cancel mid-type. */
let activeTyper: Typewriter | undefined;

const setMessageText = (set: SetState, botId: string, text: string): void => {
  set((state) => ({
    messages: state.messages.map((message) =>
      message.id === botId ? { ...message, text } : message,
    ),
  }));
};

/**
 * Drives one streamed turn: structure (meta) updates immediately, tokens feed
 * the typewriter, and the authoritative TurnResult is applied once the text has
 * finished typing out. Resolves when the bot message is fully rendered.
 */
const consumeStream = (
  set: SetState,
  botId: string,
  stream: AsyncIterable<StreamEvent>,
): Promise<void> =>
  new Promise((resolve) => {
    let result: TurnResult | undefined;

    const typer = createTypewriter({
      onText: (visible) => setMessageText(set, botId, visible),
      onComplete: () => {
        activeTyper = undefined;
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === botId ? { ...message, streaming: false } : message,
          ),
          streaming: false,
          ...(result
            ? {
                task: result.task,
                progress: result.progress,
                supportLevel: result.supportLevel,
                status: (result.done ? 'closed' : 'active') as SessionStatus,
              }
            : {}),
        }));
        resolve();
      },
    });
    activeTyper = typer;

    (async () => {
      try {
        for await (const event of stream) {
          if (event.kind === 'meta') {
            set({
              task: event.task,
              progress: event.progress,
              supportLevel: event.supportLevel,
            });
          } else if (event.kind === 'token') {
            typer.push(event.text);
          } else {
            result = event.result;
          }
        }
        typer.finish();
      } catch (error) {
        typer.cancel();
        activeTyper = undefined;
        set({ streaming: false, error: error instanceof Error ? error.message : 'Stream failed.' });
        resolve();
      }
    })();
  });

export const useSessionStore = create<SessionState>((set, get) => ({
  ...INITIAL,

  async startSession(griefProfile) {
    const sessionId = newId();
    const botId = newId();
    set({
      sessionId,
      messages: [{ id: botId, role: 'bot', text: '', streaming: true }],
      status: 'active',
      streaming: true,
      error: undefined,
    });
    await consumeStream(set, botId, data.startSessionStream(sessionId, griefProfile));
  },

  async resumeSession(sessionId) {
    activeTyper?.cancel();
    activeTyper = undefined;
    set({ ...INITIAL });
    try {
      const [state, history] = await Promise.all([
        data.getSessionState(sessionId),
        data.getMessages(sessionId),
      ]);
      set({
        sessionId,
        messages: history.map((message, index) => ({
          id: `history-${index}`,
          role: message.role === 'user' ? 'user' : 'bot',
          text: message.text,
        })),
        task: state.task,
        progress: state.progress,
        supportLevel: state.supportLevel,
        status: state.closed ? 'closed' : 'active',
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to resume the session.' });
    }
  },

  async sendUserMessage(text) {
    const { sessionId, status, streaming } = get();
    if (!sessionId || status === 'closed' || streaming) {
      return;
    }
    const botId = newId();
    set((state) => ({
      messages: [
        ...state.messages,
        userMessage(text),
        { id: botId, role: 'bot', text: '', streaming: true },
      ],
      streaming: true,
    }));
    await consumeStream(set, botId, data.sendMessageStream(sessionId, text));
  },

  reset() {
    activeTyper?.cancel();
    activeTyper = undefined;
    set({ ...INITIAL });
  },
}));
