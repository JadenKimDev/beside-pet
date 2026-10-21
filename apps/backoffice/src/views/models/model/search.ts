// 모델 화면의 주소 질의. 기간(`period` 또는 `from`·`to`)과 거르기(`purpose`, `version`)의 정본은 주소이고,
// 두 스토어는 주소를 읽어 맞춘다. 새로 고침과 링크 공유에 남게 하려는 것이다.
import type { BreakdownFilter } from '@/entities/metrics';
import {
  breakdownSearch,
  type FilterSearchReader,
  parseBreakdownSearch,
  useBreakdownFilterStore,
} from '@/features/filter-breakdown';
import {
  type PeriodSelection,
  parsePeriodSearch,
  periodSearch,
  usePeriodStore,
} from '@/features/select-period';

export function modelsSearch(selection: PeriodSelection, filter: BreakdownFilter): string {
  return new URLSearchParams({ ...periodSearch(selection), ...breakdownSearch(filter) }).toString();
}

export function readModelsSearch(search: FilterSearchReader): {
  selection: PeriodSelection;
  filter: BreakdownFilter;
} {
  return { selection: parsePeriodSearch(search), filter: parseBreakdownSearch(search) };
}

/** 주소에 기간 칸이 있는가. 없으면 다른 화면에서 고른 기간(스토어)을 이어 쓴다. */
export function hasPeriodSearch(search: FilterSearchReader): boolean {
  return search.get('period') !== null || search.get('from') !== null;
}

/** 주소에 기간이 있으면 그것, 없으면 스토어에 남은 기간. */
export function selectionFor(search: FilterSearchReader, stored: PeriodSelection): PeriodSelection {
  return hasPeriodSearch(search) ? parsePeriodSearch(search) : stored;
}

/** 주소를 읽어 스토어를 맞춘다. 주소에 기간이 없으면 기간 스토어는 그대로 둔다. */
export function syncModelsStores(search: FilterSearchReader): void {
  if (hasPeriodSearch(search)) usePeriodStore.getState().syncFromSearch(search);
  useBreakdownFilterStore.getState().syncFromSearch(search);
}
