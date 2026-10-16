/**
 * support-plan.response.ts — the per-session plan built by the Planner (mirrors SupportPlan).
 */
import { TaskFocusResponse } from './task-focus.response';

export class SupportPlanResponse {
  createdAt!: string;
  pathFocus!: string;
  taskFocuses!: TaskFocusResponse[];
  cautions!: string[];
}
