/**
 * lib/api/types.ts — the backend contract (the single port interface).
 * The frontend only knows these methods; every implementation detail of the
 * (now) to the real backend later. Absence is expressed with `undefined` only
 * (no `null`); any `null` from JSON/DB is converted at this boundary.
 *
 * The conversation language is `griefProfile.preferredLanguage` (chosen at
 * onboarding) — the single source of truth the backend replies in. It is set
 * once and travels inside the profile, so per-turn calls carry no locale.
 */
import type { Locale } from '@/i18n/config';

export type GriefPath = 'afterLoss' | 'beforeLoss';
export type LossType = 'sudden' | 'illness' | 'natural' | 'euthanasia' | 'unknown';
/** For the beforeLoss path (pet still alive): the current situation. */
export type SituationType = 'aging' | 'endOfLife' | 'ongoingCare' | 'other';
/** Time-together bucket — a range is more useful for counseling than an exact number. */
export type TogetherRange = '0-3' | '4-7' | '8-11' | '12+';

export type SleepState = 'ok' | 'fair' | 'disturbed';
export type EatingState = 'ok' | 'reduced';

/** Worden's four grief tasks. 0 = onboarding, 5 = closing. */
export type TaskId = 0 | 1 | 2 | 3 | 4 | 5;
/** Support level; 3 routes to professional help. */
export type SupportLevel = 1 | 2 | 3;

export interface DailyState {
  sleep?: SleepState;
  eating?: EatingState;
}

/** Basic counseling info collected by onboarding and handed to the session. */
export interface GriefProfile {
  griefPath: GriefPath;
  petName?: string;
  togetherRange?: TogetherRange;
  lossType?: LossType; // afterLoss path
  situation?: SituationType; // beforeLoss path
  weeksSinceLoss?: number;
  dailyState?: DailyState;
  /** Language the support conversation is conducted in (chosen at onboarding). */
  preferredLanguage?: Locale;
}

/** Result of one turn — mirrors the backend SessionService.TurnResult. */
export interface TurnResult {
  reply: string;
  task: TaskId;
  progress: number; // 0..1
  supportLevel: SupportLevel;
  done: boolean; // session ended (closed / safety hand-off)
}

/**
 * One event of a streamed turn — mirrors the backend TurnEvent wire shape.
 * `meta` (structure) arrives first, then `token`s carry the reply text, then
 * `done` carries the assembled TurnResult.
 */
export interface MetaEvent {
  kind: 'meta';
  task: TaskId;
  progress: number;
  supportLevel: SupportLevel;
  done: boolean;
}

export interface TokenEvent {
  kind: 'token';
  text: string;
}

export interface DoneEvent {
  kind: 'done';
  result: TurnResult;
}

export type StreamEvent = MetaEvent | TokenEvent | DoneEvent;

export interface StartRequest {
  sessionId: string;
  /** Present for a first-time (onboarding) session; omitted to continue from history. */
  griefProfile?: GriefProfile;
}

/** One transcript message of a session (wire shape of the backend Message). */
export interface HistoryMessage {
  role: 'assistant' | 'user';
  text: string;
  task: TaskId;
  at: string; // ISO timestamp
}

/** Current state of one session (resume / detail). */
export interface SessionStateView {
  sessionId: string;
  task: TaskId;
  progress: number;
  supportLevel: SupportLevel;
  closed: boolean;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable: boolean;
}

export type ReportSectionKey = 'journey' | 'emotions' | 'keepsake' | 'encouragement';

export interface ReportSection {
  key: ReportSectionKey;
  body: string;
}

/** User-facing mind report of a closed session (warm reflection, not analytics). */
export interface MindReport {
  at: string;
  petName: string;
  reachedTask: TaskId;
  progress: number;
  locale: Locale;
  sections: ReportSection[];
}

/** One row of the returning user's session list (newest first). */
export interface SessionListItem {
  sessionId: string;
  /** UTC instant the conversation began (ISO-8601). */
  startedAt: string;
  closed: boolean;
  reachedTask: TaskId;
  progress: number;
  petName?: string;
  /** The session's conversation language — used to restore the returning user's UI locale. */
  preferredLanguage: Locale;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable: boolean;
}

/** The single data-layer abstraction the http adapter implements.
 * The reply language is carried by griefProfile.preferredLanguage (single source),
 * so per-turn calls don't take a locale. */
export interface Api {
  start(request: StartRequest): Promise<TurnResult>;
  sendMessage(sessionId: string, text: string): Promise<TurnResult>;
  /** Streaming greeting — emits meta → tokens → done. */
  startStream(request: StartRequest): AsyncIterable<StreamEvent>;
  /** Streaming user turn — emits meta → tokens → done. */
  sendMessageStream(sessionId: string, text: string): AsyncIterable<StreamEvent>;
  /** The signed-in owner's sessions, newest first. */
  listSessions(): Promise<SessionListItem[]>;
  /** Current state of one owned session. */
  getSessionState(sessionId: string): Promise<SessionStateView>;
  /** Full transcript of one owned session. */
  getMessages(sessionId: string): Promise<HistoryMessage[]>;
  /** Mind report of a closed owned session. */
  getReport(sessionId: string): Promise<MindReport>;
  /** Ends an ongoing session (idempotent) and returns the resulting state. */
  closeSession(sessionId: string): Promise<SessionStateView>;
  /** Erases a session, its report, and its analyses. Irreversible. */
  deleteSession(sessionId: string): Promise<void>;
}
