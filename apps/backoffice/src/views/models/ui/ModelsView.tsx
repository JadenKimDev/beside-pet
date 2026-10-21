'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { type BreakdownFilter, fetchModelMetrics, type ModelsResponse } from '@/entities/metrics';
import { parseBreakdownSearch, reconcileFilter } from '@/features/filter-breakdown';
import {
  PeriodPicker,
  type PeriodSelection,
  periodQuery,
  usePeriodStore,
} from '@/features/select-period';
import { Alert, Button, PageTitle } from '@/shared/ui';
import { useAuthErrorRedirect } from '@/widgets/app-shell';
import { ModelDashboard } from '@/widgets/model-dashboard';
import {
  INITIAL_LOAD,
  type LoadState,
  loadFailed,
  loadStarted,
  loadSucceeded,
} from '../model/load';
import { hasPeriodSearch, modelsSearch, selectionFor, syncModelsStores } from '../model/search';

function ModelsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const handleAuthError = useAuthErrorRedirect();
  const stored = usePeriodStore((state) => state.selection);
  // 그리는 값은 주소에서 바로 읽는다(스토어를 맞추는 효과를 기다리면 기본 기간으로 한 번 더 부른다).
  const selection = useMemo(() => selectionFor(search, stored), [search, stored]);
  const filter = useMemo(() => parseBreakdownSearch(search), [search]);
  const [state, setState] = useState<LoadState<ModelsResponse>>(INITIAL_LOAD);
  const [attempt, setAttempt] = useState(0);

  const navigate = useCallback(
    (nextSelection: PeriodSelection, nextFilter: BreakdownFilter) => {
      router.replace(`${pathname}?${modelsSearch(nextSelection, nextFilter)}`, { scroll: false });
    },
    [router, pathname],
  );

  // 주소가 정본이고 스토어는 주소를 따라간다. 주소에 기간이 없으면 이어 쓴 기간을 주소에 적는다.
  useEffect(() => {
    syncModelsStores(search);
    if (!hasPeriodSearch(search)) navigate(selection, filter);
  }, [search, selection, filter, navigate]);

  const periodKey = JSON.stringify(selection);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 기간이 같으면(periodKey) 다시 받지 않고, attempt 는 다시 시도다
  useEffect(() => {
    let live = true;
    setState(loadStarted);
    fetchModelMetrics(periodQuery(selection))
      .then((data) => live && setState((prev) => loadSucceeded(prev, data)))
      .catch((error: unknown) => {
        if (!live || handleAuthError(error)) return;
        setState((prev) => loadFailed(prev, error));
      });
    return () => {
      live = false;
    };
  }, [periodKey, attempt, handleAuthError]);

  // 새 응답에 없는 버전이 질의에 남아 있으면 '전체' 로 되돌린다.
  useEffect(() => {
    if (!state.data) return;
    const next = reconcileFilter(filter, state.data.models);
    if (next !== filter) navigate(selection, next);
  }, [state.data, filter, selection, navigate]);

  return (
    <>
      <PageTitle
        title="모델 계측"
        description="대화 모델의 호출, 토큰, 응답 시간, 비용을 봐요."
        actions={
          <PeriodPicker
            value={selection}
            onChange={(next) => navigate(next, filter)}
            serverError={state.periodError ?? undefined}
            range={state.data ? { from: state.data.from, to: state.data.to } : undefined}
          />
        }
      />
      <div className="flex flex-col gap-6">
        {state.error && (
          <Alert tone="danger">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {state.error}
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                다시 시도
              </Button>
            </span>
          </Alert>
        )}
        <ModelDashboard
          data={state.data}
          loading={state.loading}
          filter={filter}
          onFilterChange={(next) => navigate(selection, next)}
        />
      </div>
    </>
  );
}

/** `/models`. 기간과 거르기는 주소 질의에 두고 스토어가 따라간다. */
export function ModelsView() {
  return (
    <Suspense>
      <ModelsScreen />
    </Suspense>
  );
}
