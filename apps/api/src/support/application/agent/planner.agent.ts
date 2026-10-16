/**
 * planner.agent.ts — builds a SupportPlan once at session start.
 * Deterministic in mock mode: it maps the grief profile (path, bond length,
 * loss type, daily state) to an overall approach, per-task focus, and cautions.
 * Phase 3 swaps the body for an LLM call; the signature stays the same.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TIME_PROVIDER, type TimeProvider } from '@/shared/time/time-provider';
import type { GriefProfile } from '@/support/domain/model/grief-profile';
import type { SupportPlan } from '@/support/domain/model/support-plan';
import type { TaskFocus } from '@/support/domain/model/task-focus';

const PATH_FOCUS: Record<GriefProfile['griefPath'], string> = {
  afterLoss: 'Hold space for the loss that already happened; let the story come at its own pace.',
  beforeLoss: 'Stay with anticipatory grief; honor the time that remains without rushing goodbye.',
};

const TASK_FOCUSES: TaskFocus[] = [
  { task: 1, emphasis: 'Acknowledge the reality of the loss gently.', tone: 'soft, unhurried' },
  { task: 2, emphasis: 'Make room for whatever feeling rises.', tone: 'warm, validating' },
  { task: 3, emphasis: 'Notice the everyday gaps the absence leaves.', tone: 'grounded, patient' },
  { task: 4, emphasis: 'Help carry the bond forward, not let it go.', tone: 'hopeful, tender' },
];

@Injectable()
export class PlannerAgent {
  constructor(@Inject(TIME_PROVIDER) private readonly time: TimeProvider) {}

  plan(griefProfile: GriefProfile): SupportPlan {
    return {
      createdAt: this.time.now(),
      pathFocus: PATH_FOCUS[griefProfile.griefPath],
      taskFocuses: TASK_FOCUSES.map((focus) => ({ ...focus })),
      cautions: cautionsFor(griefProfile),
    };
  }
}

/** Deterministic cautions derived from the profile (sleep, bond length, loss type). */
function cautionsFor(griefProfile: GriefProfile): string[] {
  const cautions: string[] = [];
  if (griefProfile.dailyState?.sleep === 'disturbed') {
    cautions.push('Sleep is disturbed — keep turns short and low-demand.');
  }
  if (griefProfile.togetherRange === '12+') {
    cautions.push('Long bond — expect identity-level grief, not just sadness.');
  }
  if (griefProfile.lossType === 'sudden') {
    cautions.push('Sudden loss — allow for shock and disbelief before meaning-making.');
  }
  if (griefProfile.lossType === 'euthanasia') {
    cautions.push('Euthanasia — watch for guilt; affirm the care behind the decision.');
  }
  return cautions;
}
