'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { type ConversationsResponse, fetchConversationMetrics } from '@/entities/metrics';
import {
  PeriodPicker,
  type PeriodSelection,
  parsePeriodSearch,
  periodQuery,
  usePeriodStore,
} from '@/features/select-period';
import { Alert, Button, PageTitle } from '@/shared/ui';
import { useAuthErrorRedirect } from '@/widgets/app-shell';
import { ConversationDashboard } from '@/widgets/conversation-dashboard';
import {
  INITIAL_LOAD,
  type LoadState,
  loadFailed,
  loadStarted,
  loadSucceeded,
} from '../model/load';
import { conversationsSearch, hasPeriodSearch, syncConversationsSearch } from '../model/search';

function ConversationsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const handleAuthError = useAuthErrorRedirect();
  const stored = usePeriodStore((state) => state.selection);
  // 그리는 값은 주소에서 바로 읽는다. 주소에 기간이 없으면 스토어에 남은 기간.
  const selection = useMemo(
    () => (hasPeriodSearch(search) ? parsePeriodSearch(search) : stored),
    [search, stored],
  );
  const [state, setState] = useState<LoadState<ConversationsResponse>>(INITIAL_LOAD);
  const [attempt, setAttempt] = useState(0);

  const navigate = useCallback(
    (next: PeriodSelection) => {
      router.replace(`${pathname}?${conversationsSearch(next)}`, { scroll: false });
    },
    [router, pathname],
  );

  useEffect(() => {
    const synced = syncConversationsSearch(search);
    if (!hasPeriodSearch(search)) navigate(synced);
  }, [search, navigate]);

  const periodKey = JSON.stringify(selection);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 기간이 같으면(periodKey) 다시 받지 않고, attempt 는 다시 시도다
  useEffect(() => {
    let live = true;
    setState(loadStarted);
    fetchConversationMetrics(periodQuery(selection))
      .then((data) => live && setState((prev) => loadSucceeded(prev, data)))
      .catch((error: unknown) => {
        if (!live || handleAuthError(error)) return;
        setState((prev) => loadFailed(prev, error));
      });
    return () => {
      live = false;
    };
  }, [periodKey, attempt, handleAuthError]);

  return (
    <>
      <PageTitle
        title="대화"
        description="날짜별 대화 수, 턴 수, 위기 감지 수를 봐요. 대화 내용은 볼 수 없어요."
        actions={
          <PeriodPicker
            value={selection}
            onChange={navigate}
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
        <ConversationDashboard data={state.data} loading={state.loading} />
      </div>
    </>
  );
}

/** `/conversations`. 기간은 주소 질의에 두고 스토어가 따라간다. */
export function ConversationsView() {
  return (
    <Suspense>
      <ConversationsScreen />
    </Suspense>
  );
}
