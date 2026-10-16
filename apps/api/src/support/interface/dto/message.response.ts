/**
 * message.response.ts — one transcript message (mirrors Message).
 */

import type { TaskId } from '@/support/domain/model/grief-task';
import type { Role } from '@/support/domain/model/message';

export class MessageResponse {
  role!: Role;
  text!: string;
  /** The stage the session was on when this message was recorded. */
  task!: TaskId;
  /** UTC instant (ISO-8601). */
  at!: string;
}
