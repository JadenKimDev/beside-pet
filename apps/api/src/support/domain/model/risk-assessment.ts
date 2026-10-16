/**
 * risk-assessment.ts — the safety read of a single user turn.
 * Mirrors the deterministic safety check; level 3 routes to support resources.
 */
import type { SupportLevel } from './support-level';

export type RiskDetector = 'keyword' | 'none';

export interface RiskAssessment {
  level: SupportLevel;
  detectedBy: RiskDetector;
}
