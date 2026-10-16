/**
 * mind-report.agent.ts — builds the user-facing mind report when requested.
 * Lazy: generated on demand from a closed session's own data (profile, reached
 * stage, transcript). Structural fields are deterministic here; the warm
 * section bodies come from the LLM, which reads the transcript directly —
 * emotional interpretation is delegated to the model.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import { petNameOf, preferredLanguageOf } from '@/support/domain/model/grief-profile';
import { progressOf } from '@/support/domain/model/grief-task';
import { type MindReport, REPORT_SECTION_ORDER } from '@/support/domain/model/mind-report';
import type { Session } from '@/support/domain/model/session';
import { isCrisis } from '@/support/domain/model/support-level';
import type { LlmPort } from '@/support/domain/port/llm.port';
import type { ReportContext } from '@/support/domain/port/report-context';
import { LLM_PORT } from '@/support/domain/port/tokens';

@Injectable()
export class MindReportAgent {
  constructor(
    @Inject(TIME_PROVIDER) private readonly time: TimeProvider,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
  ) {}

  async build(session: Session): Promise<MindReport> {
    const locale = preferredLanguageOf(session.griefProfile);
    const context: ReportContext = {
      petName: petNameOf(session.griefProfile),
      griefProfile: session.griefProfile,
      reachedTask: session.task,
      progress: progressOf(session.task),
      locale,
      crisis: isCrisis(session.supportLevel),
      history: session.history,
    };
    const bodies = await this.llm.composeReportBodies(context);
    return {
      at: this.time.now(),
      petName: context.petName,
      reachedTask: context.reachedTask,
      progress: context.progress,
      locale,
      sections: REPORT_SECTION_ORDER.map((key) => ({ key, body: bodies[key] })),
    };
  }
}
