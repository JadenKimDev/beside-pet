/**
 * task-transition.response.ts — the stage movement of one turn (mirrors TaskTransition).
 */
import type { TaskId } from '@/support/domain/model/grief-task';

export class TaskTransitionResponse {
  from!: TaskId;
  to!: TaskId;
  advanced!: boolean;
  retryCount!: number;
}
