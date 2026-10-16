/**
 * daily-state.request.ts — DTO for the daily-state portion of the onboarding profile (boundary validation).
 */
import { IsIn, IsOptional } from 'class-validator';
import type { DailyState } from '@/support/domain/model/daily-state';
import type { EatingState, SleepState } from '@/support/domain/model/grief-profile';

export class DailyStateRequest implements DailyState {
  @IsOptional()
  @IsIn(['ok', 'fair', 'disturbed'])
  sleep?: SleepState;

  @IsOptional()
  @IsIn(['ok', 'reduced'])
  eating?: EatingState;
}
