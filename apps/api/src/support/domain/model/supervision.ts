/**
 * supervision.ts — a background quality read of a generated reply.
 * Produced by the Supervisor only when the gate (shouldReview) opens, so it is
 * optional on a turn analysis. Off the critical path — never blocks the reply.
 */
export type SupervisionQuality = 'ok' | 'review';

export interface Supervision {
  /** Whether the gate opened and a review actually ran. */
  evaluated: boolean;
  quality: SupervisionQuality;
  /** Issues noticed (empty when none). */
  flags: string[];
  note?: string;
}
