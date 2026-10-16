/**
 * message.ts — record of one conversation turn (entity). Speaker, text, task at the time, timestamp.
 */
import type { TaskId } from './grief-task';

export type Role = 'assistant' | 'user';

export interface Message {
  role: Role;
  text: string;
  task: TaskId;
  at: string; // ISO timestamp
}

export const createMessage = (role: Role, text: string, task: TaskId, at: string): Message => ({
  role,
  text,
  task,
  at,
});
