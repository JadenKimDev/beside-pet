/**
 * progression.ts — outcome of one stage-transition evaluation.
 */
export interface Progression {
  /** Whether this turn advanced to the next stage (= not a follow-up). */
  advanced: boolean;
  /** Whether the latest answer engaged — drives deepen vs. a gentle re-ask. */
  lastEngaged: boolean;
}
