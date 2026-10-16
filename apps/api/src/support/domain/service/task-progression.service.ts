/**
 * task-progression.service.ts — stage transition rules (pure domain).
 * Progress is measurable and the depth per stage is a deliberate quality lever:
 * instead of advancing on the first answer, the companion stays on a stage and
 * asks deeper follow-ups, so each stage gets room to breathe.
 *
 * Deterministic depth gate (evaluated from the user answers given within the
 * current stage, so it needs no extra persisted counters):
 *  - engaged     = a substantive answer (not "I don't know", longer than a few words)
 *  - stay        = keep the user on this stage and go one layer deeper
 *  - advance when:
 *      · MIN_DEPTH reached and the latest answer engaged — the stage got room to
 *        breathe and the user gave something solid, so move on (typical case), or
 *      · the user disengaged (DISENGAGE_EXIT consecutive non-engaged answers) —
 *        never push someone who isn't ready; advance gently, or
 *      · MAX_DEPTH reached (hard cap so it never gets stuck).
 * So a stage runs ~3 turns normally and up to MAX_DEPTH when answers stay thin.
 * Being deterministic guarantees regression reproducibility, and it matches the
 * frontend mock's decision rules.
 */
import { Injectable } from '@nestjs/common';
import type { Progression } from '@/support/domain/model/progression';

/** Stay on a stage for at least this many turns before a normal advance. */
export const MIN_DEPTH = 3;
/** Never keep a user on one stage longer than this (hard cap). */
export const MAX_DEPTH = 5;
/** Consecutive non-engaged answers that trigger a gentle early advance. */
export const DISENGAGE_EXIT = 2;

// Disengagement signals ("I don't know" / a one-word reply). Case-insensitive;
// the apostrophe is optional to catch "dont".
const DUNNO_PATTERN =
  /i don['’]?t know|dunno|don['’]?t remember|can['’]?t remember|not sure|no idea|hard to say/i;
const MIN_MEANINGFUL_LENGTH = 8;

@Injectable()
export class TaskProgressionService {
  /** Whether one answer engages with the question (vs. "I don't know" / a one-word reply). */
  isEngaged(text: string): boolean {
    return !DUNNO_PATTERN.test(text) && text.trim().length > MIN_MEANINGFUL_LENGTH;
  }

  /**
   * Decides the transition from the user answers given so far within the current
   * stage (ordered, including the current turn). Pure function.
   */
  evaluate(answersInStage: string[]): Progression {
    const depth = answersInStage.length;
    const lastEngaged = this.isEngaged(answersInStage[depth - 1] ?? '');
    const disengageStreak = this.trailingDisengaged(answersInStage);
    const advanced =
      (depth >= MIN_DEPTH && lastEngaged) ||
      disengageStreak >= DISENGAGE_EXIT ||
      depth >= MAX_DEPTH;
    return { advanced, lastEngaged };
  }

  /** Counts consecutive non-engaged answers at the tail of the stage. */
  private trailingDisengaged(answers: string[]): number {
    let streak = 0;
    for (let i = answers.length - 1; i >= 0; i -= 1) {
      if (this.isEngaged(answers[i] ?? '')) {
        break;
      }
      streak += 1;
    }
    return streak;
  }
}
