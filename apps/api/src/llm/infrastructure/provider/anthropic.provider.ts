/**
 * anthropic.provider.ts — Claude vendor adapter (Messages API).
 * Requires ANTHROPIC_API_KEY at construction — the app is live-only, so a
 * missing key fails the boot with a clear error instead of degrading silently.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GenerationRequest } from '@/llm/domain/model/generation-request';
import type { GenerationResult } from '@/llm/domain/model/generation-result';
import { LlmProvider } from '@/llm/domain/model/llm-provider';
import { costUsd } from '@/llm/domain/model/model-pricing';
import type { UsageRecord } from '@/llm/domain/model/usage-record';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import type { StreamEvent } from './stream-event';
import type { TextModelProvider } from './text-model-provider';

@Injectable()
export class AnthropicProvider implements TextModelProvider {
  readonly provider = LlmProvider.Anthropic;
  private readonly client: Anthropic;

  constructor(
    config: ConfigService,
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey || apiKey.length === 0) {
      throw new Error('ANTHROPIC_API_KEY is required — the server runs on a live model only.');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const response = await this.client.messages.create({
      model: request.model.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages,
    });
    const text = response.content.find((block) => block.type === 'text');
    return {
      text: text && text.type === 'text' ? text.text : '',
      usage: this.toUsage(request.model.model, response.usage),
    };
  }

  async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
    const stream = this.client.messages.stream({
      model: request.model.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    yield { type: 'usage', usage: this.toUsage(request.model.model, final.usage) };
  }

  private toUsage(model: string, usage: Anthropic.Usage): UsageRecord {
    return {
      provider: this.provider,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: costUsd(model, usage.input_tokens, usage.output_tokens),
      at: this.time.now(),
    };
  }
}
