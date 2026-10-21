// 모델 화면과 대화 화면이 같은 기간을 쓰도록 하나만 둔다. 주소 질의가 정본이고, views 가 질의를 읽어 맞춘다.
import { create } from 'zustand';
import {
  DEFAULT_SELECTION,
  type PeriodSelection,
  parsePeriodSearch,
  type SearchReader,
  sameSelection,
} from './period';

export type PeriodStoreState = {
  selection: PeriodSelection;
  setSelection: (selection: PeriodSelection) => void;
  /** 주소 질의를 읽어 맞춘다. 뜻이 같으면 객체를 바꾸지 않는다. */
  syncFromSearch: (search: SearchReader) => void;
};

export const usePeriodStore = create<PeriodStoreState>()((set, get) => ({
  selection: DEFAULT_SELECTION,
  setSelection: (selection) => set({ selection }),
  syncFromSearch: (search) => {
    const next = parsePeriodSearch(search);
    if (!sameSelection(get().selection, next)) set({ selection: next });
  },
}));
