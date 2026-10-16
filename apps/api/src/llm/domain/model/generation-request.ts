/**
 * generation-request.ts — one text-generation call, provider-neutral.
 * The model is part of the request (not module config), so callers can swap
 * models per call via the ModelRef DTO.
 */
import type { ModelRef } from './model-ref';
import type { PromptMessage } from './prompt-message';

export interface GenerationRequest {
  model: ModelRef;
  system?: string;
  messages: PromptMessage[];
  maxTokens: number;
}
