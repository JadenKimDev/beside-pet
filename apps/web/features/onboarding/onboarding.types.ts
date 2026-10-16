/**
 * features/onboarding/onboarding.types.ts — onboarding-feature domain types.
 */
import type { GriefProfile } from '@/lib/api';

export type OnboardingStatus = 'active' | 'done';

/** One choice chip — its label (display) and the GriefProfile value (patch) it carries. */
export type ChoiceOption = { label: string; patch: Partial<GriefProfile> };

/** Which input widget a step shows (free text / choice chips). */
export type StepInput =
  | { kind: 'text'; placeholder?: string }
  | { kind: 'choice'; options: ChoiceOption[] };
