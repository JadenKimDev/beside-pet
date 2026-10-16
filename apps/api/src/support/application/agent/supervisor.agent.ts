/**
 * supervisor.agent.ts — background quality check on a generated reply.
 * A value gate (shouldReview) keeps it off most turns: it runs only when the
 * turn advanced, the support level is elevated, or on a sampling cadence — so
 * cost stays low. Deterministic in mock mode; LLM-judge later.
 */
import { Injectable } from '@nestjs/common';
import type { Supervision } from '@/support/domain/model/supervision';
import { SUPPORT_WATCH, type SupportLevel } from '@/support/domain/model/support-level';
import type { ReviewInput } from './review-input';

/** Run a review every Nth turn even when nothing else triggers it. */
const SAMPLE_EVERY = 3;

@Injectable()
export class SupervisorAgent {
  /** The value gate — only worth reviewing turns that advanced, are elevated, or sampled. */
  shouldReview(advanced: boolean, level: SupportLevel, turnIndex: number): boolean {
    return advanced || level >= SUPPORT_WATCH || turnIndex % SAMPLE_EVERY === 0;
  }

  review(input: ReviewInput): Supervision {
    const flags: string[] = [];
    if (input.reply.trim().length === 0) {
      flags.push('empty-reply');
    }
    if (input.level >= SUPPORT_WATCH) {
      flags.push('elevated-support-level');
    }
    return {
      evaluated: true,
      quality: flags.length > 0 ? 'review' : 'ok',
      flags,
      note: flags.length > 0 ? 'Flagged for human review.' : undefined,
    };
  }
}
