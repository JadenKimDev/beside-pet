/**
 * model-router.ts — TextModelPort implementation.
 * Routes each request to the provider named in its ModelRef and records the
 * resulting usage to the usage sink. Providers register in the constructor.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { GenerationRequest } from '@/llm/domain/model/generation-request';
import type { GenerationResult } from '@/llm/domain/model/generation-result';
import type { LlmProvider } from '@/llm/domain/model/llm-provider';
import type { TextModelPort } from '@/llm/domain/port/text-model.port';
import { LlmDiToken } from '@/llm/domain/port/tokens';
import type { UsageSink } from '@/llm/domain/port/usage-sink.port';
import { AnthropicProvider } from './provider/anthropic.provider';
import type { TextModelProvider } from './provider/text-model-provider';

@Injectable()
export class ModelRouter implements TextModelPort {
  private readonly providers: Map<LlmProvider, TextModelProvider>;

  constructor(
    anthropic: AnthropicProvider,
    @Inject(LlmDiToken.UsageSink) private readonly usageSink: UsageSink,
  ) {
    this.providers = new Map([anthropic].map((provider) => [provider.provider, provider] as const));
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const result = await this.resolve(request).generate(request);
    this.usageSink.record(result.usage);
    return result;
  }

  async *stream(request: GenerationRequest): AsyncIterable<string> {
    for await (const event of this.resolve(request).stream(request)) {
      if (event.type === 'text') {
        yield event.text;
      } else {
        this.usageSink.record(event.usage);
      }
    }
  }

  private resolve(request: GenerationRequest): TextModelProvider {
    const provider = this.providers.get(request.model.provider);
    if (!provider) {
      throw new Error(`No provider registered for "${request.model.provider}"`);
    }
    return provider;
  }
}
