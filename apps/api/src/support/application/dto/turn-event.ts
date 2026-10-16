/**
 * turn-event.ts — one server-sent event of a streamed turn.
 * The structure (task, progress, support level, done) is decided by the
 * deterministic domain and sent first as `meta`; the reply text then arrives as
 * a sequence of `token` events; `done` carries the final TurnResult. This mirrors
 * the "structure first, text streamed" contract the synchronous TurnResult has.
 */
import { progressOf } from '@/support/domain/model/grief-task';
import type { Session } from '@/support/domain/model/session';
import { type TurnResult, toTurnResult } from './turn-result';

/** Structural snapshot, emitted before any token. */
export interface MetaEvent {
  kind: 'meta';
  task: number;
  progress: number;
  supportLevel: number;
  done: boolean;
}

/** One chunk of the reply text. */
export interface TokenEvent {
  kind: 'token';
  text: string;
}

/** Terminal event carrying the assembled TurnResult. */
export interface DoneEvent {
  kind: 'done';
  result: TurnResult;
}

export type TurnEvent = MetaEvent | TokenEvent | DoneEvent;

export const toMetaEvent = (session: Session): MetaEvent => ({
  kind: 'meta',
  task: session.task,
  progress: progressOf(session.task),
  supportLevel: session.supportLevel,
  done: session.closed,
});

export const toDoneEvent = (session: Session, reply: string): DoneEvent => ({
  kind: 'done',
  result: toTurnResult(session, reply),
});
