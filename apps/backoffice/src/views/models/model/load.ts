// 계측 응답을 받는 상태. 다시 받는 중이거나 실패해도 이전 응답은 지우지 않는다(화면 안 1절).
// 400 은 기간의 오류라 기간 선택 아래에 보이고, 그 밖의 실패는 화면 위 Alert 다. 401·403 은 views 가 먼저 가로챈다.
import { isApiError } from '@/shared/api';

export type LoadState<Data> = {
  data: Data | null;
  loading: boolean;
  error: string | null;
  periodError: string | null;
};

export const LOAD_FAILED = '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export const INITIAL_LOAD: LoadState<never> = {
  data: null,
  loading: true,
  error: null,
  periodError: null,
};

export const loadStarted = <Data>(state: LoadState<Data>): LoadState<Data> => ({
  ...state,
  loading: true,
});

export const loadSucceeded = <Data>(_state: LoadState<Data>, data: Data): LoadState<Data> => ({
  data,
  loading: false,
  error: null,
  periodError: null,
});

export function loadFailed<Data>(state: LoadState<Data>, error: unknown): LoadState<Data> {
  const period = isApiError(error) && error.status === 400;
  return {
    data: state.data,
    loading: false,
    error: period ? null : LOAD_FAILED,
    periodError: period ? error.message : null,
  };
}
