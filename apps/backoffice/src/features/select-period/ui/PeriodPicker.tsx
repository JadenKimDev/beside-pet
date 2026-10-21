'use client';

import { useState } from 'react';
import { Field, Input, Segmented, type SegmentedOption } from '@/shared/ui';
import {
  type CustomRange,
  customRangeError,
  defaultCustomRange,
  formatRange,
  PERIOD_CHOICES,
  PERIOD_TEXT,
  type PeriodChoice,
  type PeriodSelection,
  periodErrorText,
} from '../model/period';

export type PeriodPickerProps = {
  value: PeriodSelection;
  /** 프리셋을 고르거나, 직접 입력의 두 날짜가 맞을 때만 부른다. */
  onChange: (selection: PeriodSelection) => void;
  /** 서버의 기간 400 문구. 한국어로 바꿔 보인다. */
  serverError?: string;
  /** 응답의 `from`, `to`. 있으면 아래에 로컬 시각으로 보인다. */
  range?: { from: string; to: string };
};

const OPTIONS: SegmentedOption<PeriodChoice>[] = PERIOD_CHOICES.map((choice) => ({
  value: choice,
  label: PERIOD_TEXT[choice],
}));

export function PeriodPicker({ value, onChange, serverError, range }: PeriodPickerProps) {
  // 직접 입력을 골랐지만 두 날짜가 아직 맞지 않으면 `value` 는 이전 프리셋이다. 그동안 칸을 열어 둔다.
  const [editing, setEditing] = useState(false);
  const choice: PeriodChoice = editing ? 'custom' : value.preset;
  const [draft, setDraft] = useState<CustomRange>(() =>
    value.preset === 'custom' ? { start: value.start, end: value.end } : defaultCustomRange(),
  );
  const draftError = choice === 'custom' ? customRangeError(draft.start, draft.end) : null;
  const error = draftError ?? (serverError ? periodErrorText(serverError) : undefined);

  function choose(next: PeriodChoice) {
    setEditing(next === 'custom');
    if (next !== 'custom') onChange({ preset: next });
    else if (customRangeError(draft.start, draft.end) === null) {
      onChange({ preset: 'custom', ...draft });
    }
  }

  function edit(field: keyof CustomRange, text: string) {
    const next = { ...draft, [field]: text };
    setDraft(next);
    if (customRangeError(next.start, next.end) === null) onChange({ preset: 'custom', ...next });
  }

  return (
    <div className="flex flex-col gap-2">
      <Segmented label={PERIOD_TEXT.group} options={OPTIONS} value={choice} onChange={choose} />
      {choice === 'custom' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Field label={PERIOD_TEXT.start} htmlFor="period-start">
            <Input
              id="period-start"
              type="date"
              value={draft.start}
              max={draft.end || undefined}
              onChange={(event) => edit('start', event.target.value)}
            />
          </Field>
          <Field label={PERIOD_TEXT.end} htmlFor="period-end">
            <Input
              id="period-end"
              type="date"
              value={draft.end}
              min={draft.start || undefined}
              onChange={(event) => edit('end', event.target.value)}
            />
          </Field>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {range && (
        <p className="text-xs text-fg-muted tabular-nums">{formatRange(range.from, range.to)}</p>
      )}
    </div>
  );
}
