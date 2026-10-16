/** Who authored a chat message. */
export type Role = 'user' | 'bot';

/** A chat message rendered by the chat UI. Shared by onboarding and session. */
export interface Message {
  id: string;
  role: Role;
  text: string;
  /** True while a streamed reply is still arriving (shows a typing indicator). */
  streaming?: boolean;
}
