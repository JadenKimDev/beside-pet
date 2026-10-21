// 역할과 프롬프트 버전 거르기(화면 안 6절). 주소 질의 `?purpose=&version=` 가 정본이고,
// 응답에 없는 버전이 질의에 남아 있으면 '전체' 로 되돌린다. 역할은 세 값이 고정이라 되돌리지 않는다.
import {
  type BreakdownFilter,
  type ModelUsage,
  PURPOSE_LABELS,
  PURPOSES,
  type Purpose,
  promptVersionsOf,
} from '@/entities/metrics';
import type { SelectOption } from '@/shared/ui';

export const DEFAULT_FILTER: BreakdownFilter = { purpose: 'all', version: 'all' };

export const FILTER_TEXT = {
  all: '전체',
  purpose: '역할',
  version: '프롬프트 버전',
} as const;

/** `URLSearchParams` 와 Next 의 `ReadonlyURLSearchParams` 가 함께 맞는 모양. */
export type FilterSearchReader = { get: (name: string) => string | null };

export function parseBreakdownSearch(search: FilterSearchReader): BreakdownFilter {
  const purpose = PURPOSES.find((value) => value === search.get('purpose'));
  return { purpose: purpose ?? 'all', version: search.get('version') || 'all' };
}

/** 고른 칸만 주소 질의로. 호출자가 기간 칸과 합친다. */
export function breakdownSearch(filter: BreakdownFilter): Record<string, string> {
  return {
    ...(filter.purpose === 'all' ? {} : { purpose: filter.purpose }),
    ...(filter.version === 'all' ? {} : { version: filter.version }),
  };
}

/** 고른 버전이 응답에 없으면 '전체' 로. 바뀌지 않으면 같은 객체를 돌려준다. */
export function reconcileFilter(
  filter: BreakdownFilter,
  rows: readonly ModelUsage[],
): BreakdownFilter {
  if (filter.version === 'all' || promptVersionsOf(rows).includes(filter.version)) return filter;
  return { ...filter, version: 'all' };
}

export function purposeOptions(): SelectOption[] {
  return [
    { value: 'all', label: FILTER_TEXT.all },
    ...PURPOSES.map((purpose) => ({
      value: purpose,
      label: `${PURPOSE_LABELS[purpose]} (${purpose})`,
    })),
  ];
}

/** '전체' 와 응답의 버전들(최신이 위). */
export function versionOptions(rows: readonly ModelUsage[]): SelectOption[] {
  return [
    { value: 'all', label: FILTER_TEXT.all },
    ...promptVersionsOf(rows).map((version) => ({ value: version, label: version })),
  ];
}

export function toPurpose(value: string): Purpose | 'all' {
  return PURPOSES.find((purpose) => purpose === value) ?? 'all';
}
