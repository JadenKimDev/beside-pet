/**
 * task-focus.response.ts — per-stage emphasis of the support plan.
 */
import type { TaskId } from '@/support/domain/model/grief-task';

export class TaskFocusResponse {
  task!: TaskId;
  emphasis!: string;
  tone!: string;
}
