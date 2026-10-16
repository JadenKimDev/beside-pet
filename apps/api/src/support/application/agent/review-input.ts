/**
 * review-input.ts — input for SupervisorAgent.review (one generated reply).
 */
import type { TaskId } from '@/support/domain/model/grief-task';
import type { ReplyPhaseName } from '@/support/domain/model/reply-phase';
import type { SupportLevel } from '@/support/domain/model/support-level';

export interface ReviewInput {
  reply: string;
  task: TaskId;
  phase: ReplyPhaseName;
  level: SupportLevel;
}
