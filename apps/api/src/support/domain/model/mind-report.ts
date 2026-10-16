/**
 * mind-report.ts — the user-facing "mind report" shown when a session closes.
 * Distinct from the internal SessionSummary (analytical, for the company): this
 * is a warm, supportive reflection for the grieving user, in their language.
 * The structural fields are deterministic; the section bodies are LLM-written
 * (warm narrative).
 */
import type { Locale } from '@/shared/locale';
import type { TaskId } from './grief-task';

export type ReportSectionKey = 'journey' | 'emotions' | 'keepsake' | 'encouragement';

/** A report needs at least one completed stage — below this there is too little to reflect on. */
export const REPORT_MIN_TASK: TaskId = 2;

/** Whether a session has enough of a journey (and is wrapped up) to carry a report. */
export const isReportAvailable = (task: TaskId, closed: boolean): boolean =>
  closed && task >= REPORT_MIN_TASK;

/** One card of the report: a stable key plus its LLM-written warm body. */
export interface MindReportSection {
  key: ReportSectionKey;
  body: string;
}

export interface MindReport {
  /** UTC instant the report was generated. */
  at: string;
  petName: string;
  reachedTask: TaskId;
  progress: number;
  locale: Locale;
  sections: MindReportSection[];
}

/** Card order in the report. */
export const REPORT_SECTION_ORDER: ReportSectionKey[] = [
  'journey',
  'emotions',
  'keepsake',
  'encouragement',
];
