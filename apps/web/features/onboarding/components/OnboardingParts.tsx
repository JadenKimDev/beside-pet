'use client';

import Image from 'next/image';
import { type ReactNode, useState } from 'react';
import { Button, Chip, ChipList, cx, Icon, Input } from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import type { GriefPath } from '@/lib/api';
import type { ChoiceOption } from '../onboarding.types';
import { artFor, artSource } from './illustration';
import { QUESTION_TOTAL } from './progress';

/** 진행 표시: 막대 여섯과 "n / 6". */
export function Progress({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: QUESTION_TOTAL }, (_, index) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정 길이의 장식 막대다.
            key={index}
            className={cx('h-1 w-[22px] rounded-sm', index < number ? 'bg-accent' : 'bg-bg-sunk')}
          />
        ))}
      </span>
      <span className="ml-2 text-xs text-fg-muted">{label}</span>
    </div>
  );
}

/** 흔적 배지: 앞서 고른 답들. 누르는 기능은 없다. */
export function Trail({ answers }: { answers: string[] }) {
  if (answers.length === 0) return null;
  return (
    <ul className="m-0 mt-5 flex list-none flex-wrap gap-1.5 p-0">
      {answers.map((answer, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: 답은 순서대로 쌓이기만 한다.
          key={index}
          className="rounded-pill border border-border bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-muted"
        >
          {answer}
        </li>
      ))}
    </ul>
  );
}

/** 말하는 이: 발 아바타와 "마음이 · AI 동반자". */
export function Speaker({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-fg-muted">
      <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-5">
        <Icon name="paw" />
      </span>
      <span>{name}</span>
    </div>
  );
}

/** 바닥 줄: 왼쪽에 안내, 오른쪽에 건너뛰기(ghost). */
export function SkipFoot({
  hint,
  skipLabel,
  onSkip,
}: {
  hint: string;
  skipLabel: string;
  onSkip: () => void;
}) {
  return (
    <div className="mt-7 flex items-center justify-between gap-4 border-t border-border pt-5">
      <span className="text-xs text-fg-muted">{hint}</span>
      <Button variant="ghost" size="sm" onClick={onSkip}>
        {skipLabel}
      </Button>
    </div>
  );
}

export function Choices({
  options,
  onSelect,
}: {
  options: ChoiceOption[];
  onSelect: (option: ChoiceOption) => void;
}) {
  return (
    <ChipList>
      {options.map((option) => (
        <Chip key={option.label} onClick={() => onSelect(option)}>
          {option.label}
        </Chip>
      ))}
    </ChipList>
  );
}

/** 두 갈래 카드. 각 카드에 그 갈래의 작은 삽화와 설명을 단다. */
export function PathCards({
  options,
  describe,
  onSelect,
}: {
  options: ChoiceOption[];
  describe: (path: GriefPath) => string;
  onSelect: (option: ChoiceOption) => void;
}) {
  const theme = useDocumentTheme();
  return (
    <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
      {options.map((option) => {
        const path = option.patch.griefPath ?? 'afterLoss';
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onSelect(option)}
            className="cursor-pointer overflow-hidden rounded-lg border border-border bg-surface p-0 text-left text-fg transition-[transform,box-shadow,border-color] duration-(--t-base) ease-soft hover:-translate-y-[3px] hover:border-accent hover:shadow-2 focus-visible:shadow-focus focus-visible:outline-none max-sm:grid max-sm:grid-cols-[96px_1fr]"
          >
            <span className="relative block h-[140px] bg-[linear-gradient(160deg,var(--color-warm),var(--color-accent-soft))] max-sm:h-auto max-sm:min-h-24">
              <Image
                src={artSource(theme, artFor(path), 512)}
                alt=""
                fill
                sizes="(max-width: 640px) 96px, 280px"
                className="object-cover"
              />
            </span>
            <span className="block px-[18px] pt-4 pb-[18px]">
              <b className="block text-base">{option.label}</b>
              <span className="text-[13px] text-fg-muted">{describe(path)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 이름 칸: Enter 또는 둥근 화살표로 다음. 빈 채로 다음은 건너뛰기와 같다(호출하는 쪽이 정한다). */
export function NameEntry({
  placeholder,
  nextLabel,
  onNext,
}: {
  placeholder?: string;
  nextLabel: string;
  onNext: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2.5">
      <Input
        inputSize="lg"
        value={name}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onNext(name);
        }}
      />
      <button
        type="button"
        aria-label={nextLabel}
        onClick={() => onNext(name)}
        className="grid size-14 flex-none cursor-pointer place-items-center rounded-full bg-accent text-accent-fg shadow-1 transition-[background-color,transform,box-shadow] duration-(--t-fast) ease-soft hover:-translate-y-px hover:bg-accent-hover hover:shadow-2 focus-visible:shadow-focus focus-visible:outline-none [&_svg]:size-5"
      >
        <Icon name="arrow-right" />
      </button>
    </div>
  );
}

/** 마무리 요약 한 줄. */
export function SummaryRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{term}</dt>
      <dd className="m-0 font-semibold">{children}</dd>
    </div>
  );
}
