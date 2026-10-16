/**
 * mind-report-section.response.ts — one card of the mind report.
 */
import type { ReportSectionKey } from '@/support/domain/model/mind-report';

export class MindReportSectionResponse {
  key!: ReportSectionKey;
  body!: string;
}
