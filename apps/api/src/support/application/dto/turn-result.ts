/**
 * turn-result.ts — the result of a single turn. 1:1 with TurnResult in the frontend lib/api/types.ts.
 * Assertions target this observable contract (state), not the reply text.
 */
import { progressOf } from '@/support/domain/model/grief-task';
import type { Session } from '@/support/domain/model/session';

export interface TurnResult {
  reply: string;
  task: number;
  progress: number; // 0..1
  supportLevel: number;
  done: boolean;
}

/** Builds a TurnResult from the session's current state plus the reply. */
export const toTurnResult = (session: Session, reply: string): TurnResult => ({
  reply,
  task: session.task,
  progress: progressOf(session.task),
  supportLevel: session.supportLevel,
  done: session.closed,
});
