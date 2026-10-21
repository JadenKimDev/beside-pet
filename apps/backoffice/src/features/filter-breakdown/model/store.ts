// 모델 화면의 거르기 상태. 주소 질의가 정본이고, views 가 질의를 읽어 맞춘다.

import { create } from 'zustand';
import type { BreakdownFilter, ModelUsage, Purpose } from '@/entities/metrics';
import {
  DEFAULT_FILTER,
  type FilterSearchReader,
  parseBreakdownSearch,
  reconcileFilter,
} from './filter';

export type BreakdownFilterState = {
  filter: BreakdownFilter;
  setFilter: (filter: BreakdownFilter) => void;
  setPurpose: (purpose: Purpose | 'all') => void;
  setVersion: (version: string) => void;
  clear: () => void;
  /** 새 응답에 없는 버전을 '전체' 로 되돌린다. */
  reconcile: (rows: readonly ModelUsage[]) => void;
  syncFromSearch: (search: FilterSearchReader) => void;
};

export const useBreakdownFilterStore = create<BreakdownFilterState>()((set, get) => ({
  filter: DEFAULT_FILTER,
  setFilter: (filter) => set({ filter }),
  setPurpose: (purpose) => set({ filter: { ...get().filter, purpose } }),
  setVersion: (version) => set({ filter: { ...get().filter, version } }),
  clear: () => set({ filter: DEFAULT_FILTER }),
  reconcile: (rows) => {
    const next = reconcileFilter(get().filter, rows);
    if (next !== get().filter) set({ filter: next });
  },
  syncFromSearch: (search) => {
    const next = parseBreakdownSearch(search);
    const current = get().filter;
    if (next.purpose !== current.purpose || next.version !== current.version) set({ filter: next });
  },
}));
