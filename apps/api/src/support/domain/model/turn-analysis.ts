/**
 * turn-analysis.ts — the structured record of one turn, kept on the session.
 * Assembled by the orchestrator from deterministic domain decisions (risk,
 * transition, knowledge) plus an optional background Supervision. This is what
 * the analysis-view API exposes alongside the transcript.
 */
import type { TaskId } from './grief-task';
import type { KnowledgeRef } from './knowledge-ref';
import type { ReplyPhaseName } from './reply-phase';
import type { RiskAssessment } from './risk-assessment';
import type { Supervision } from './supervision';
import type { TaskTransition } from './task-transition';

export interface TurnAnalysis {
  /** UTC instant the turn was processed. */
  at: string;
  task: TaskId;
  phase: ReplyPhaseName;
  risk: RiskAssessment;
  transition: TaskTransition;
  knowledge: KnowledgeRef[];
  /** Present only when the supervision gate opened. */
  supervision?: Supervision;
}
