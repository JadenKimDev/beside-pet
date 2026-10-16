/**
 * grief-profile.request.ts — DTO for external-boundary validation. Narrows incoming JSON to a concrete type as soon as it arrives.
 * Once validation passes, the structure matches the domain GriefProfile (no separate mapping needed).
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { LOCALES, type Locale } from '@/shared/locale';
import type {
  GriefPath,
  LossType,
  SituationType,
  TogetherRange,
} from '@/support/domain/model/grief-profile';
import { DailyStateRequest } from './daily-state.request';

export class GriefProfileRequest {
  @IsIn(['afterLoss', 'beforeLoss'])
  griefPath!: GriefPath;

  @IsOptional()
  @IsString()
  petName?: string;

  @IsOptional()
  @IsIn(['0-3', '4-7', '8-11', '12+'])
  togetherRange?: TogetherRange;

  @IsOptional()
  @IsIn(['sudden', 'illness', 'natural', 'euthanasia', 'unknown'])
  lossType?: LossType;

  @IsOptional()
  @IsIn(['aging', 'endOfLife', 'ongoingCare', 'other'])
  situation?: SituationType;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeksSinceLoss?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DailyStateRequest)
  dailyState?: DailyStateRequest;

  @IsOptional()
  @IsIn(LOCALES)
  preferredLanguage?: Locale;
}
