/**
 * features/session/session.turn.ts — how one turn's stream is driven and settled.
 * The store (session.store.ts) owns the state and the actions; these are the steps
 * its actions share: consuming a stream through the typewriter, what the transcript
 * shows when a turn ends without a reply, re-attaching to and retrying a turn the
 * server holds, and taking a stopped turn off the screen.
 */
import type { Message } from '@/components/chat/types';
import type {
  ActiveTurn,
  HistoryMessage,
  SessionStateView,
  StreamEvent,
  TurnResult,
} from '@/lib/api';
import * as data from '@/lib/data';
import { createTypewriter, type Typewriter } from '@/lib/stream/typewriter';
import type { SessionState, TurnInFlight } from './session.store';

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}`;
export const now = (): string => new Date().toISOString();

export type SetState = (
  partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>),
) => void;

/** What outlives one call: the store's actions and these helpers share it. */
export const runtime: {
  /** The typewriter for the in-flight reply, so reset() can cancel mid-type. */
  activeTyper: Typewriter | undefined;
  /** Bumped by reset/resume/stop so a stream from a conversation already left cannot write. */
  generation: number;
  /** Counts stops so each returned draft is put into the composer once. */
  draftKey: number;
} = { activeTyper: undefined, generation: 0, draftKey: 0 };

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
 * `cancelled`: the server stopped the turn (a `cancelled` event).
 */
type StreamOutcome =
  | { status: 'done' }
  | { status: 'stale' }
  | { status: 'cancelled' }
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
export const consumeStream = (
  set: SetState,
  get: () => SessionState,
  botId: string,
  userId: string | undefined,
  stream: AsyncIterable<StreamEvent>,
): Promise<StreamOutcome> =>
  new Promise((resolve) => {
    const mine = runtime.generation;
    const live = () => mine === runtime.generation;
    let result: TurnResult | undefined;
    let accepted = false;
    let received = false;
    let cancelled = false;

    const typer = createTypewriter({
      onText: (visible) => {
        if (live()) patchMessage(set, botId, { text: visible });
      },
      onComplete: () => {
        runtime.activeTyper = undefined;
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
    runtime.activeTyper = typer;

    (async () => {
      try {
        for await (const event of stream) {
          if (!live()) break;
          if (event.kind === 'meta') {
            accepted = true;
            set({ task: event.task, progress: event.progress, supportLevel: event.supportLevel });
            patchMessage(set, botId, { task: event.task, supportLevel: event.supportLevel });
            if (userId) patchMessage(set, userId, { sending: false });
            set((state) =>
              state.turn?.botId === botId ? { turn: { ...state.turn, accepted: true } } : {},
            );
          } else if (event.kind === 'token') {
            received = true;
            typer.push(event.text);
          } else if (event.kind === 'cancelled') {
            cancelled = true;
            break;
          } else {
            result = event.result;
          }
        }
        if (cancelled) {
          typer.cancel();
          runtime.activeTyper = undefined;
          resolve(live() ? { status: 'cancelled' } : { status: 'stale' });
          return;
        }
        typer.finish();
      } catch (error) {
        typer.cancel();
        runtime.activeTyper = undefined;
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
    // The server received this turn but its reply failed: "get the reply again" goes under it.
    ...(message.role === 'user' && message.turnId && message.turnId === state.failedTurn?.turnId
      ? { replyFailed: true }
      : {}),
    // History carries no per-message level; the session's level belongs to its last reply.
    ...(index === lastBot ? { supportLevel: state.supportLevel } : {}),
  }));
};

/** The session's state and transcript as the server holds them, and the turn still being answered. */
export const sessionSnapshot = async (
  sessionId: string,
): Promise<{ snapshot: Partial<SessionState>; activeTurn?: ActiveTurn }> => {
  const [state, history] = await Promise.all([
    data.getSessionState(sessionId),
    data.getMessages(sessionId),
  ]);
  return {
    snapshot: {
      messages: toMessages(history, state),
      task: state.task,
      progress: state.progress,
      supportLevel: state.supportLevel,
      status: state.closed ? 'closed' : 'active',
      reportAvailable: state.reportAvailable,
    },
    ...(state.activeTurn && !state.closed ? { activeTurn: state.activeTurn } : {}),
  };
};

/** Messages with `bubble` placed right after the message `afterId` (at the end when absent). */
export const insertAfter = (
  messages: Message[],
  afterId: string | undefined,
  bubble: Message,
): Message[] => {
  const index = messages.findIndex((message) => message.id === afterId);
  if (index < 0) return [...messages, bubble];
  return [...messages.slice(0, index + 1), bubble, ...messages.slice(index + 1)];
};

/** A stopped turn leaves the screen: its user bubble and its reply bubble. */
export const dropTurn = (set: SetState, turn: TurnInFlight, draft: boolean): void => {
  runtime.draftKey += 1;
  const key = runtime.draftKey;
  set((state) => ({
    messages: state.messages.filter(
      (message) => message.id !== turn.botId && message.id !== turn.userId,
    ),
    streaming: false,
    stopping: false,
    turn: undefined,
    error: undefined,
    ...(draft ? { draft: { text: turn.text, key } } : {}),
  }));
};

/** The turn in flight is over (whatever the outcome); a newer one is left alone. */
const clearTurn = (set: SetState, botId: string): void => {
  set((state) => (state.turn?.botId === botId ? { turn: undefined } : {}));
};

/** The greeting broke: keep what was said, drop an empty reply. */
export const settleGreeting = (set: SetState, botId: string, outcome: StreamOutcome): void => {
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
  const mine = runtime.generation;
  try {
    const { snapshot } = await sessionSnapshot(sessionId);
    if (mine === runtime.generation) set({ ...snapshot, streaming: false, error: undefined });
  } catch (error) {
    if (mine === runtime.generation)
      settleFailedTurn(set, botId, userId, { accepted: true, error });
  }
};

/**
 * Sends one user turn under its client-made `turnId` (the server's idempotency key).
 * A stream that breaks before `meta` is sent once more under the same id; a 409 means
 * the server already received it, so the transcript is re-read instead.
 */
export const sendTurn = async (
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
    turn: { turnId, userId, botId, text, accepted: false },
  }));
  try {
    await sendAttempts(set, get, sessionId, text, turnId, userId, botId);
  } finally {
    clearTurn(set, botId);
  }
};

const sendAttempts = async (
  set: SetState,
  get: () => SessionState,
  sessionId: string,
  text: string,
  turnId: string,
  userId: string,
  botId: string,
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await consumeStream(
      set,
      get,
      botId,
      userId,
      data.sendMessageStream(sessionId, text, turnId),
    );
    if (outcome.status === 'cancelled') return settleCancelled(set, get, botId);
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

/**
 * The server stopped the turn. Stopped here: `stopTurn` takes the turn off the screen once
 * its cancel answers. Stopped elsewhere (another tab): it goes without returning the words.
 */
const settleCancelled = (set: SetState, get: () => SessionState, botId: string): void => {
  const { turn, stopping } = get();
  if (stopping || turn?.botId !== botId) return;
  dropTurn(set, turn, false);
};

/**
 * Follows the reply of a turn the server already holds — re-attached (`streamTurn`) or made
 * again (`retryTurnStream`). Without a reply the message stays and "get the reply again"
 * shows under it; a 409 means the turn moved on (finished, failed, stopped), so the
 * transcript is re-read.
 */
export const followTurn = async (
  set: SetState,
  get: () => SessionState,
  sessionId: string,
  turn: TurnInFlight,
  stream: AsyncIterable<StreamEvent>,
): Promise<void> => {
  try {
    const outcome = await consumeStream(set, get, turn.botId, turn.userId, stream);
    if (outcome.status === 'cancelled') return settleCancelled(set, get, turn.botId);
    if (outcome.status !== 'noReply') return;
    if (!outcome.accepted && data.isTurnAlreadyReceived(outcome.error) && turn.userId) {
      return resyncTurn(set, sessionId, turn.botId, turn.userId);
    }
    if (turn.userId)
      return settleFailedTurn(set, turn.botId, turn.userId, { ...outcome, accepted: true });
    settleGreeting(set, turn.botId, outcome);
  } finally {
    clearTurn(set, turn.botId);
  }
};

/** The last user message of `turnId` in the transcript, if the history carries it. */
const userMessageOf = (messages: Message[], turnId: string): Message | undefined =>
  messages.filter((message) => message.role === 'user' && message.turnId === turnId).at(-1);

/** Re-entering while a reply is being made: a flowing bubble under its message, fed by the turn stream. */
export const attachTurn = (
  set: SetState,
  get: () => SessionState,
  sessionId: string,
  activeTurn: ActiveTurn,
): Promise<void> => {
  const user = userMessageOf(get().messages, activeTurn.turnId);
  const turn: TurnInFlight = {
    turnId: activeTurn.turnId,
    userId: user?.id,
    botId: newId(),
    text: user?.text ?? '',
    accepted: false,
  };
  set((state) => ({
    messages: insertAfter(state.messages, turn.userId, {
      id: turn.botId,
      role: 'bot',
      text: '',
      streaming: true,
      at: now(),
    }),
    streaming: true,
    turn,
  }));
  return followTurn(set, get, sessionId, turn, data.streamTurn(sessionId, turn.turnId));
};
