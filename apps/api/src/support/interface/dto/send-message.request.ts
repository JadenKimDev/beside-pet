/**
 * send-message.request.ts — request body for POST /v1/sessions/:id/messages.
 * The reply language is derived from the session's profile (preferredLanguage),
 * so the turn only carries the user's text.
 */
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
