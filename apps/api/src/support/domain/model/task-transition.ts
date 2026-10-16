/**
 * task-transition.ts — what happened to task progress on a single turn.
 * Records whether the turn advanced to the next task or re-asked the current one.
 */
import type { TaskId } from './grief-task';

export interface TaskTransition {
  from: TaskId;
  to: TaskId;
  /** True when the turn advanced; false when it re-asked (retry). */
  advanced: boolean;
  retryCount: number;
}
