/**
 * text-model.port.ts — the single entry point for text generation (out).
 * Provider/model selection travels inside the request (ModelRef), so the same
 * caller can hit different vendors per call. Implemented by the model router.
 */
import type { GenerationRequest } from '../model/generation-request';
import type { GenerationResult } from '../model/generation-result';

export interface TextModelPort {
  generate(request: GenerationRequest): Promise<GenerationResult>;
  /** Streams text chunks; usage is recorded to the usage sink on completion. */
  stream(request: GenerationRequest): AsyncIterable<string>;
}
