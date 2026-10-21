// 대화 화면의 주소 질의. 기간(`period` 또는 `from`·`to`)만 있고, 정본은 주소다. 기간 스토어는 주소를 따라가고,
// 주소에 기간이 없으면(탐색 링크로 들어왔을 때) 모델 화면에서 고른 기간을 스토어에서 이어 쓴다.
import {
  type PeriodSelection,
  periodSearch,
  type SearchReader,
  usePeriodStore,
} from '@/features/select-period';

export function conversationsSearch(selection: PeriodSelection): string {
  return new URLSearchParams(periodSearch(selection)).toString();
}

export function hasPeriodSearch(search: SearchReader): boolean {
  return search.get('period') !== null || search.get('from') !== null;
}

/** 주소에 기간이 있으면 스토어를 맞추고, 그 뒤 스토어의 기간을 돌려준다. */
export function syncConversationsSearch(search: SearchReader): PeriodSelection {
  if (hasPeriodSearch(search)) usePeriodStore.getState().syncFromSearch(search);
  return usePeriodStore.getState().selection;
}
