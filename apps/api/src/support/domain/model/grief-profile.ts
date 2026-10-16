/**
 * grief-profile.ts — the starting point collected by onboarding (scripted intake) and passed to the session.
 * Matches the contract with the frontend lib/api/types.ts GriefProfile. Absence is expressed only as undefined.
 */
import type { Locale } from '@/shared/locale';
import type { DailyState } from './daily-state';

export type GriefPath = 'afterLoss' | 'beforeLoss';
export type LossType = 'sudden' | 'illness' | 'natural' | 'euthanasia' | 'unknown';
export type SituationType = 'aging' | 'endOfLife' | 'ongoingCare' | 'other';
export type TogetherRange = '0-3' | '4-7' | '8-11' | '12+';

export type SleepState = 'ok' | 'fair' | 'disturbed';
export type EatingState = 'ok' | 'reduced';

export interface GriefProfile {
  griefPath: GriefPath;
  petName?: string;
  togetherRange?: TogetherRange;
  lossType?: LossType;
  situation?: SituationType;
  weeksSinceLoss?: number;
  dailyState?: DailyState;
  /** Language the support conversation is conducted in (chosen at onboarding). */
  preferredLanguage?: Locale;
}

/** Default support language when onboarding didn't record a preference. */
export const DEFAULT_PREFERRED_LANGUAGE: Locale = 'en';

/** Generic pet placeholder (the model rephrases it naturally in the conversation language). */
const PET_NAME_FALLBACK = 'your little one';

/** Display name used in utterances; falls back to a generic placeholder when not provided. */
export const petNameOf = (griefProfile: GriefProfile): string =>
  griefProfile.petName ?? PET_NAME_FALLBACK;

/** The conversation language — the single source of truth for reply localization. */
export const preferredLanguageOf = (griefProfile: GriefProfile): Locale =>
  griefProfile.preferredLanguage ?? DEFAULT_PREFERRED_LANGUAGE;
