/**
 * summarizer.agent.ts — one-page recap built when the session closes.
 * Deterministic: it reads only the session's own structural state (reached
 * task, turn count, highest support level). Emotional interpretation is not
 * done here — the report LLM reads the transcript and infers it directly.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { isClosingTask, type TaskId } from '@/support/domain/model/grief-task';
import type { Session } from '@/support/domain/model/session';
import type { SessionSummary } from '@/support/domain/model/session-summary';
import { SUPPORT_CRISIS, SUPPORT_WATCH } from '@/support/domain/model/support-level';

@Injectable()
export class SummarizerAgent {
  constructor(@Inject(TIME_PROVIDER) private readonly time: TimeProvider) {}

  summarize(session: Session): SessionSummary {
    const turnCount = session.analyses.length;
    return {
      at: this.time.now(),
      reachedTask: session.task,
      turnCount,
      highestSupportLevel: session.supportLevel,
      headline: headlineFor(session.task, turnCount),
      followUp: followUpFor(session.supportLevel),
    };
  }
}

/** Closing (task 5) means all four grief tasks were worked through. */
function headlineFor(reachedTask: TaskId, turnCount: number): string {
  if (isClosingTask(reachedTask)) {
    return `Worked through all 4 grief tasks across ${turnCount} turns.`;
  }
  return `Reached task ${reachedTask} of 4 across ${turnCount} turns.`;
}

function followUpFor(level: number): string {
  if (level >= SUPPORT_CRISIS) {
    return 'Crisis resources were surfaced — encourage professional follow-up.';
  }
  if (level >= SUPPORT_WATCH) {
    return 'A gentle check-in soon is suggested.';
  }
  return 'Open to continue at their own pace.';
}
