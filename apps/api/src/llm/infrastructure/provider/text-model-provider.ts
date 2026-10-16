/**
 * text-model-provider.ts — the contract every vendor adapter implements.
 * The router looks providers up by their `provider` id; adding a vendor means
 * one new implementation of this interface (support code stays untouched).
 */
import type { GenerationRequest } from '@/llm/domain/model/generation-request';
import type { GenerationResult } from '@/llm/domain/model/generation-result';
import type { LlmProvider } from '@/llm/domain/model/llm-provider';
import type { StreamEvent } from './stream-event';

export interface TextModelProvider {
  readonly provider: LlmProvider;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  stream(request: GenerationRequest): AsyncIterable<StreamEvent>;
}
