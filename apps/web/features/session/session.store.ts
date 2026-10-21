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
import type {
  GriefProfile,
  HistoryMessage,
  SessionStateView,
  StreamEvent,
  SupportLevel,
  TaskId,
  TurnResult,
} from '@/lib/api';
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
  /** Sends a message that failed again (it is removed and re-sent under its turn id). */
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
 * How one stream ended. `done`: the reply typed out with its TurnResult.
 * `noReply`: no TurnResult — `accepted` says whether `meta` (the server stored the
 * user's message) arrived first, `error` is what broke the stream, if anything.
 * `stale`: the conversation was left (reset/resume) while it ran.
 */
type StreamOutcome =
  | { status: 'done' }
  | { status: 'stale' }
  | { status: 'noReply'; accepted: boolean; received: boolean; error?: unknown };

/** A user turn goes out at most this many times (the first try + one silent retry). */
const SEND_ATTEMPTS = 2;

/**
 * Drives one streamed turn: structure (meta) updates immediately, tokens feed
 * the typewriter, and the authoritative TurnResult is applied once the text has
 * finished typing out. Resolves when the bot message is fully rendered, or when
 * the stream breaks — then the caller decides what the transcript shows.
 * `meta` is the server's receipt: it clears the user's message "sending" mark.
 */
const consumeStream = (
  set: SetState,
  get: () => SessionState,
  botId: string,
  userId: string | undefined,
  stream: AsyncIterable<StreamEvent>,
): Promise<StreamOutcome> =>
  new Promise((resolve) => {
    const mine = generation;
    const live = () => mine === generation;
    let result: TurnResult | undefined;
    let accepted = false;
    let received = false;

    const typer = createTypewriter({
      onText: (visible) => {
        if (live()) patchMessage(set, botId, { text: visible });
      },
      onComplete: () => {
        activeTyper = undefined;
        if (!live()) return resolve({ status: 'stale' });
        if (!result) return resolve({ status: 'noReply', accepted, received });
        const turn = result;
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === botId
              ? { ...message, streaming: false, task: turn.task, supportLevel: turn.supportLevel }
              : message,
          ),
          streaming: false,
          task: turn.task,
          progress: turn.progress,
          supportLevel: turn.supportLevel,
          status: turn.done ? 'closed' : 'active',
        }));
        const sessionId = get().sessionId;
        if (turn.done && sessionId) void loadReportAvailability(set, sessionId);
        resolve({ status: 'done' });
      },
    });
    activeTyper = typer;

    (async () => {
      try {
        for await (const event of stream) {
          if (!live()) break;
          if (event.kind === 'meta') {
            accepted = true;
            set({ task: event.task, progress: event.progress, supportLevel: event.supportLevel });
            patchMessage(set, botId, { task: event.task, supportLevel: event.supportLevel });
            if (userId) patchMessage(set, userId, { sending: false });
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
        resolve(live() ? { status: 'noReply', accepted, received, error } : { status: 'stale' });
      }
    })();
  });

const errorText = (error: unknown, fallback: string): string | undefined =>
  error === undefined ? undefined : error instanceof Error ? error.message : fallback;

/** History rows → chat messages. The session's level belongs to its last reply. */
const toMessages = (history: HistoryMessage[], state: SessionStateView): Message[] => {
  const lastBot = history.map((message) => message.role).lastIndexOf('assistant');
  return history.map((message, index) => ({
    id: `history-${index}`,
    role: message.role === 'user' ? 'user' : 'bot',
    text: message.text,
    at: message.at,
    task: message.task,
    ...(message.turnId ? { turnId: message.turnId } : {}),
    // History carries no per-message level; the session's level belongs to its last reply.
    ...(index === lastBot ? { supportLevel: state.supportLevel } : {}),
  }));
};

/** The session's state and transcript as the server holds them. */
const sessionSnapshot = async (sessionId: string): Promise<Partial<SessionState>> => {
  const [state, history] = await Promise.all([
    data.getSessionState(sessionId),
    data.getMessages(sessionId),
  ]);
  return {
    messages: toMessages(history, state),
    task: state.task,
    progress: state.progress,
    supportLevel: state.supportLevel,
    status: state.closed ? 'closed' : 'active',
    reportAvailable: state.reportAvailable,
  };
};

/** The greeting broke: keep what was said, drop an empty reply. */
const settleGreeting = (set: SetState, botId: string, outcome: StreamOutcome): void => {
  if (outcome.status !== 'noReply') return;
  set((state) => ({
    messages: outcome.received
      ? state.messages.map((message) =>
          message.id === botId ? { ...message, streaming: false } : message,
        )
      : state.messages.filter((message) => message.id !== botId),
    streaming: false,
    ...(outcome.error === undefined ? {} : { error: errorText(outcome.error, 'Stream failed.') }),
  }));
};

/**
 * A user turn without a reply. Not accepted (no `meta`): the message never reached
 * the server — it is marked not sent, with "send again". Accepted: the server has
 * the message, so it stays as said; the reply bubble goes and a "no reply" note shows.
 */
const settleFailedTurn = (
  set: SetState,
  botId: string,
  userId: string,
  outcome: { accepted: boolean; error?: unknown },
): void => {
  const mark: Partial<Message> = outcome.accepted
    ? { sending: false, replyFailed: true }
    : { sending: false, failed: true };
  set((state) => ({
    messages: state.messages
      .filter((message) => message.id !== botId)
      .map((message) => (message.id === userId ? { ...message, ...mark } : message)),
    streaming: false,
    error: errorText(outcome.error, 'Stream failed.'),
  }));
};

/** The server already has this turn (409): the transcript is re-read from it. */
const resyncTurn = async (
  set: SetState,
  sessionId: string,
  botId: string,
  userId: string,
): Promise<void> => {
  const mine = generation;
  try {
    const snapshot = await sessionSnapshot(sessionId);
    if (mine === generation) set({ ...snapshot, streaming: false, error: undefined });
  } catch (error) {
    if (mine === generation) settleFailedTurn(set, botId, userId, { accepted: true, error });
  }
};

/**
 * Sends one user turn under its client-made `turnId` (the server's idempotency key).
 * A stream that breaks before `meta` is sent once more under the same id; a 409 means
 * the server already received it, so the transcript is re-read instead.
 */
const sendTurn = async (
  set: SetState,
  get: () => SessionState,
  text: string,
  turnId: string,
): Promise<void> => {
  const { sessionId, task } = get();
  if (!sessionId) return;
  const userId = newId();
  const botId = newId();
  set((state) => ({
    messages: [
      ...state.messages,
      { id: userId, role: 'user', text, at: now(), task, turnId, sending: true },
      { id: botId, role: 'bot', text: '', streaming: true, at: now() },
    ],
    streaming: true,
    error: undefined,
  }));
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await consumeStream(
      set,
      get,
      botId,
      userId,
      data.sendMessageStream(sessionId, text, turnId),
    );
    if (outcome.status !== 'noReply') return;
    if (data.isTurnAlreadyReceived(outcome.error)) return resyncTurn(set, sessionId, botId, userId);
    // Only a dropped connection is retried; a server's refusal stays a failure.
    const broke =
      !outcome.accepted && outcome.error !== undefined && !data.isServerRefusal(outcome.error);
    if (broke && attempt < SEND_ATTEMPTS) {
      patchMessage(set, botId, { text: '', streaming: true });
      continue;
    }
    return settleFailedTurn(set, botId, userId, outcome);
  }
};

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
    activeTyper?.cancel();
    activeTyper = undefined;
    generation += 1;
    const mine = generation;
    set({ ...INITIAL, sessionId, petName });
    try {
      const snapshot = await sessionSnapshot(sessionId);
      if (mine !== generation) return;
      set(snapshot);
    } catch (error) {
      if (mine !== generation) return;
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
