/**
 * session-summary.ts — a one-page recap produced when the session closes.
 * Built by the Summarizer for later review (per-company / per-account). Off the
 * critical path. Deterministic in mock mode; LLM-backed later.
 */
import type { TaskId } from './grief-task';
import type { SupportLevel } from './support-level';

export interface SessionSummary {
  /** UTC instant the summary was created. */
  at: string;
  reachedTask: TaskId;
  turnCount: number;
  highestSupportLevel: SupportLevel;
  /** One-line recap of the session. */
  headline: string;
  /** Gentle follow-up suggestion. */
  followUp: string;
}
