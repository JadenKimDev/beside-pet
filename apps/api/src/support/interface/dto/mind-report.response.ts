/**
 * mind-report.response.ts — the user-facing mind report (mirrors MindReport).
 */

import type { Locale } from '@/shared/locale';
import type { TaskId } from '@/support/domain/model/grief-task';
import { MindReportSectionResponse } from './mind-report-section.response';

export class MindReportResponse {
  /** UTC instant the report was generated. */
  at!: string;
  petName!: string;
  reachedTask!: TaskId;
  progress!: number;
  locale!: Locale;
  sections!: MindReportSectionResponse[];
}
