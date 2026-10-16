/**
 * usage-record.ts — token spend of one generation call, priced in USD.
 * The raw material for per-model cost analysis (Phase 2 dashboard).
 */
import type { LlmProvider } from './llm-provider';

export interface UsageRecord {
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** ISO 8601 instant the call completed. */
  at: string;
}
