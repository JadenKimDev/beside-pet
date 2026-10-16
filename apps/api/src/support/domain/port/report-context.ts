/**
 * report-context.ts — everything the LLM adapter needs to write the mind report.
 * The structural facts are decided by the deterministic domain; the LLM only
 * writes the warm section bodies (ReportBodies) from these facts + the transcript.
 */
import type { Locale } from '@/shared/locale';
import type { GriefProfile } from '../model/grief-profile';
import type { TaskId } from '../model/grief-task';
import type { Message } from '../model/message';

export interface ReportContext {
  petName: string;
  griefProfile: GriefProfile;
  reachedTask: TaskId;
  progress: number;
  locale: Locale;
  /** Whether a crisis support level was reached (adds a gentle resource note). */
  crisis: boolean;
  history: readonly Message[];
}

/** The four warm card bodies the LLM writes for the report. */
export interface ReportBodies {
  journey: string;
  emotions: string;
  keepsake: string;
  encouragement: string;
}
