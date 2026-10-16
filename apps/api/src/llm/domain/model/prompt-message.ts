/**
 * prompt-message.ts — provider-neutral chat message for a generation request.
 */
export type PromptRole = 'user' | 'assistant';

export interface PromptMessage {
  role: PromptRole;
  content: string;
}
