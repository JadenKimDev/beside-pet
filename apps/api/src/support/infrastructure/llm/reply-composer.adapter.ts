/**
 * reply-composer.adapter.ts — Implementation of the empathetic-reply port.
 * Thin by design: prompt construction lives in the sibling prompt/ modules and
 * the vendor call is delegated to the llm module's TextModelPort with a
 * per-call ModelRef, so providers/models can be swapped without touching this
 * file. Model failures propagate to the caller — the app is live-only and has
 * no canned-reply fallback. Structural fields are decided by the orchestrator;
 * this adapter only produces text.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLlmProvider, LlmProvider } from '@/llm/domain/model/llm-provider';
import type { ModelRef } from '@/llm/domain/model/model-ref';
import type { TextModelPort } from '@/llm/domain/port/text-model.port';
import { LlmDiToken } from '@/llm/domain/port/tokens';
import { matchesCrisis } from '@/safety/domain/crisis-pattern';
import type { LlmPort } from '@/support/domain/port/llm.port';
import type { ReplyContext } from '@/support/domain/port/reply-context';
import type { ReportBodies, ReportContext } from '@/support/domain/port/report-context';
import { buildReplySystemPrompt, toPromptMessages } from './prompt/reply.prompt';
import {
  buildReportSystemPrompt,
  buildReportUserPrompt,
  parseReportBodies,
} from './prompt/report.prompt';
import { RISK_SYSTEM_PROMPT } from './prompt/risk.prompt';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 320;
const REPORT_MAX_TOKENS = 900;

@Injectable()
export class ReplyComposerAdapter implements LlmPort {
  private readonly logger = new Logger(ReplyComposerAdapter.name);
  private readonly modelRef: ModelRef;

  constructor(
    config: ConfigService,
    @Inject(LlmDiToken.TextModel) private readonly textModel: TextModelPort,
  ) {
    this.modelRef = resolveDefaultModel(config);
    this.logger.log(`Model: ${this.modelRef.provider}/${this.modelRef.model}`);
  }

  async composeReply(context: ReplyContext): Promise<string> {
    const result = await this.textModel.generate({
      model: this.modelRef,
      maxTokens: MAX_TOKENS,
      system: buildReplySystemPrompt(context),
      messages: toPromptMessages(context),
    });
    const text = result.text.trim();
    if (text.length === 0) {
      throw new Error('Model returned an empty reply.');
    }
    return text;
  }

  async *streamReply(context: ReplyContext): AsyncIterable<string> {
    yield* this.textModel.stream({
      model: this.modelRef,
      maxTokens: MAX_TOKENS,
      system: buildReplySystemPrompt(context),
      messages: toPromptMessages(context),
    });
  }

  async composeReportBodies(context: ReportContext): Promise<ReportBodies> {
    const result = await this.textModel.generate({
      model: this.modelRef,
      maxTokens: REPORT_MAX_TOKENS,
      system: buildReportSystemPrompt(context),
      messages: [{ role: 'user', content: buildReportUserPrompt(context) }],
    });
    return parseReportBodies(result.text);
  }

  async assessRisk(text: string): Promise<boolean> {
    try {
      const result = await this.textModel.generate({
        model: this.modelRef,
        maxTokens: 5,
        system: RISK_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      });
      return result.text.trim().toUpperCase().startsWith('YES');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Model risk check failed — falling back to keyword screen: ${reason}`);
      return matchesCrisis(text);
    }
  }
}

/**
 * Default ModelRef from env: LLM_PROVIDER/LLM_MODEL take precedence; otherwise
 * Anthropic (CLAUDE_MODEL kept for compatibility). The Anthropic provider
 * itself requires ANTHROPIC_API_KEY and fails the boot without it.
 */
function resolveDefaultModel(config: ConfigService): ModelRef {
  const model =
    config.get<string>('LLM_MODEL') ?? config.get<string>('CLAUDE_MODEL') ?? DEFAULT_MODEL;
  const configured = config.get<string>('LLM_PROVIDER');
  if (configured && isLlmProvider(configured)) {
    return { provider: configured, model };
  }
  return { provider: LlmProvider.Anthropic, model };
}
