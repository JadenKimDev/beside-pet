/**
 * close-session.command.ts — input for the user-initiated session close.
 */
import type { Requester } from './ownership';

export interface CloseSessionCommand {
  sessionId: string;
  requester: Requester;
}
