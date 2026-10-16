/**
 * send-message.command.ts — input for SendMessageUseCase (one user turn).
 */
import type { Requester } from './ownership';

export interface SendMessageCommand {
  sessionId: string;
  text: string;
  requester: Requester;
}
