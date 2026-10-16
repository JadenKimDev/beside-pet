/**
 * model-ref.ts — a fully-qualified model selection, passed per call.
 * Callers pick provider + model at request time, so the same prompt can be
 * routed to different models freely (comparison tests, cost analysis).
 */
import type { LlmProvider } from './llm-provider';

export interface ModelRef {
  provider: LlmProvider;
  model: string;
}
