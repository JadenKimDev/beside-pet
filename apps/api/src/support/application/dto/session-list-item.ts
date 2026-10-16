/**
 * session-list-item.ts — one row of the owner's session list (newest first).
 */
import type { Locale } from '@/shared/locale';

export interface SessionListItem {
  sessionId: string;
  /** UTC instant the conversation began (ISO-8601). */
  startedAt: string;
  closed: boolean;
  reachedTask: number;
  progress: number;
  petName?: string;
  /** The session's conversation language — used to restore the returning user's UI locale. */
  preferredLanguage: Locale;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable: boolean;
}
