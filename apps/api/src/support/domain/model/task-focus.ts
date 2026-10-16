/**
 * task-focus.ts — how one grief task should be approached for this person.
 * Produced by the Planner from the grief profile; consumed when composing a reply.
 */
import type { TaskId } from './grief-task';

export interface TaskFocus {
  task: TaskId;
  /** What to emphasize within this task for this person. */
  emphasis: string;
  /** Tone guidance for utterances in this task. */
  tone: string;
}
