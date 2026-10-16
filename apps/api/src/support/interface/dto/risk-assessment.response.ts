/**
 * risk-assessment.response.ts — the risk read of one turn (mirrors RiskAssessment).
 */
import type { RiskDetector } from '@/support/domain/model/risk-assessment';
import type { SupportLevel } from '@/support/domain/model/support-level';

export class RiskAssessmentResponse {
  level!: SupportLevel;
  detectedBy!: RiskDetector;
}
