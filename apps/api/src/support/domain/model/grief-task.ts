/**
 * grief-task.ts — Models the four grief journey stages as a value object.
 * The core domain concept that makes progress "measurable". 0 = onboarding, 5 = closing.
 * The stage is an identity, not a label — naming it for a user is the client's job.
 */
export type TaskId = 0 | 1 | 2 | 3 | 4 | 5;

const NEXT_TASK: Record<TaskId, TaskId> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5 };

/** First support task (entry point right after onboarding). */
export const FIRST_TASK: TaskId = 1;

/** Whether closing has been reached — determines session termination. */
export const isClosingTask = (task: TaskId): boolean => task >= 5;

export const nextTask = (task: TaskId): TaskId => NEXT_TASK[task];

/** Overall journey progress (0~1). Based on tasks 1~4. */
export const progressOf = (task: TaskId): number => Math.min(Math.max(task - 1, 0) / 4, 1);
