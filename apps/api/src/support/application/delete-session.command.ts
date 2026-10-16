/**
 * delete-session.command.ts — input for erasing one conversation.
 */
import type { Requester } from './ownership';

export interface DeleteSessionCommand {
  sessionId: string;
  requester: Requester;
}
