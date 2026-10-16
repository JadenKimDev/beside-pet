/**
 * safety-check.service.ts — pure domain rules that classify risk signals into levels.
 * Being deterministic (rule-based) guarantees regression reproducibility — safety is not entrusted to LLM judgment.
 * Aligned with the frontend mock's patterns so behavior matches across the mock→real swap.
 */
import { Injectable } from '@nestjs/common';
import { matchesCrisis } from '@/safety/domain/crisis-pattern';
import { SUPPORT_CRISIS, SUPPORT_SAFE, type SupportLevel } from '../model/support-level';

@Injectable()
export class SafetyCheckService {
  check(text: string): SupportLevel {
    return matchesCrisis(text) ? SUPPORT_CRISIS : SUPPORT_SAFE;
  }
}
