import type { SupportLevel, TaskId } from '@/lib/api';

/** Who authored a chat message. */
export type Role = 'user' | 'bot';

/** A chat message rendered by the chat UI. Shared by onboarding and session. */
export interface Message {
  id: string;
  role: Role;
  text: string;
  /** True while a streamed reply is still arriving (shows a typing indicator). */
  streaming?: boolean;
  /** When it was said (ISO). Live messages take the browser's clock; history takes the server's. */
  at?: string;
  /** The stage the server placed this turn in. A rise between messages draws a stage divider. */
  task?: TaskId;
  /** The server's support level for a reply. 3 puts the crisis card under it. */
  supportLevel?: SupportLevel;
  /** A user message that never reached the server (shown dashed, with "send again"). */
  failed?: boolean;
}
