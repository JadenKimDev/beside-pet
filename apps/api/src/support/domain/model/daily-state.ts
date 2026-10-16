/**
 * daily-state.ts — optional snapshot of the companion's day-to-day wellbeing collected during onboarding.
 */
import type { EatingState, SleepState } from './grief-profile';

export interface DailyState {
  sleep?: SleepState;
  eating?: EatingState;
}
