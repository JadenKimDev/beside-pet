/**
 * llm.module.ts — shared text-model infrastructure.
 * Exposes TextModelPort (per-call provider/model routing) and UsageSink
 * (token/cost records) behind enum DI tokens. Feature modules import this and
 * keep their own domain-language ports on top.
 */
import { Module } from '@nestjs/common';
import { LlmDiToken } from './domain/port/tokens';
import { InMemoryUsageRecorder } from './infrastructure/in-memory-usage.recorder';
import { ModelRouter } from './infrastructure/model-router';
import { AnthropicProvider } from './infrastructure/provider/anthropic.provider';

@Module({
  providers: [
    AnthropicProvider,
    { provide: LlmDiToken.UsageSink, useClass: InMemoryUsageRecorder },
    { provide: LlmDiToken.TextModel, useClass: ModelRouter },
  ],
  exports: [LlmDiToken.TextModel, LlmDiToken.UsageSink],
})
export class LlmModule {}
