/**
 * session-list-item.response.ts — one row of the owner's session list (mirrors SessionListItem).
 */
import type { Locale } from '@/shared/locale';

export class SessionListItemResponse {
  sessionId!: string;
  /** UTC instant the conversation began (ISO-8601). */
  startedAt!: string;
  closed!: boolean;
  reachedTask!: number;
  progress!: number;
  petName?: string;
  preferredLanguage!: Locale;
  /** Whether the mind report can be viewed (wrapped up with enough progress). */
  reportAvailable!: boolean;
}
