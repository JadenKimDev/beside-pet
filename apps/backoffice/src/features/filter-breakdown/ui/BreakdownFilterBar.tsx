'use client';

import type { BreakdownFilter, ModelUsage } from '@/entities/metrics';
import { Field, Select } from '@/shared/ui';
import { FILTER_TEXT, purposeOptions, toPurpose, versionOptions } from '../model/filter';

export type BreakdownFilterBarProps = {
  /** 지금 응답의 `models` 행. 버전 선택지를 여기서 구한다. */
  rows: readonly ModelUsage[];
  value: BreakdownFilter;
  onChange: (filter: BreakdownFilter) => void;
};

const PURPOSE_OPTIONS = purposeOptions();

export function BreakdownFilterBar({ rows, value, onChange }: BreakdownFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="sm:w-56">
        <Field label={FILTER_TEXT.purpose} htmlFor="breakdown-purpose">
          <Select
            id="breakdown-purpose"
            options={PURPOSE_OPTIONS}
            value={value.purpose}
            onChange={(event) => onChange({ ...value, purpose: toPurpose(event.target.value) })}
          />
        </Field>
      </div>
      <div className="sm:w-56">
        <Field label={FILTER_TEXT.version} htmlFor="breakdown-version">
          <Select
            id="breakdown-version"
            options={versionOptions(rows)}
            value={value.version}
            onChange={(event) => onChange({ ...value, version: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
