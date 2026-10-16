/**
 * reply-context.ts — everything the LLM adapter needs to compose one empathetic utterance.
 * The structural fields (phase, task) are decided by the deterministic domain.
 */
import type { Locale } from '@/shared/locale';
import type { TaskId } from '../model/grief-task';
import type { Message } from '../model/message';
import type { SessionSummary } from '../model/session-summary';
import type { KnowledgeChunk } from './knowledge-chunk';
import type { ReplyPhase } from './llm.port';

/** Carry-over from the user's previous session, so a resume greeting can pick up the thread. */
export interface PreviousSessionContext {
  summary?: SessionSummary;
  /** Tail of the previous transcript the greeting may gently reference. */
  recentHistory: readonly Message[];
}

export interface ReplyContext {
  phase: ReplyPhase;
  task: TaskId;
  petName: string;
  locale: Locale;
  knowledge: KnowledgeChunk[];
  history: readonly Message[];
  userText?: string;
  /** Present on a resume greeting — cross-session continuity context. */
  previous?: PreviousSessionContext;
}
