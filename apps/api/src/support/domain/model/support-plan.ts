/**
 * support-plan.ts — a per-session plan built once from the grief profile.
 * The Planner sets the overall approach and per-task focus so replies stay
 * consistent across the session. Structure only — no LLM text generation.
 */
import type { TaskFocus } from './task-focus';

export interface SupportPlan {
  /** UTC instant the plan was created. */
  createdAt: string;
  /** Overall approach derived from the grief path (afterLoss / beforeLoss). */
  pathFocus: string;
  /** Per-task emphasis and tone. */
  taskFocuses: TaskFocus[];
  /** Things to be mindful of for this person (e.g. disturbed sleep). */
  cautions: string[];
}
