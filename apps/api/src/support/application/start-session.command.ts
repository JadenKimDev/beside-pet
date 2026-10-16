/**
 * start-session.command.ts — input for StartSessionUseCase.
 */
import type { GriefProfile } from '@/support/domain/model/grief-profile';

export interface StartSessionCommand {
  sessionId: string;
  ownerId: string;
  /** Present for a first-time session (from onboarding); omitted to continue. */
  griefProfile?: GriefProfile;
}
