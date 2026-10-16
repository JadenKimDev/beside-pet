/**
 * session-summary.response.ts — structural recap built at close (mirrors SessionSummary).
 */
import type { TaskId } from '@/support/domain/model/grief-task';
import type { SupportLevel } from '@/support/domain/model/support-level';

export class SessionSummaryResponse {
  at!: string;
  reachedTask!: TaskId;
  turnCount!: number;
  highestSupportLevel!: SupportLevel;
  headline!: string;
  followUp!: string;
}
