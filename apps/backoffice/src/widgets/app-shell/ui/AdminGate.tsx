'use client';

// 화면 쪽 관리자 가드. 편의일 뿐이고 판정은 서버다(관리자 API 는 관리자가 아니면 `403 Insufficient role`).
// 401 이면 로그인(`?next=`), 관리자가 아니거나 403 이면 권한 없음으로 보내고, 관리자일 때만 아래를 그린다.

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { fetchViewer, type Viewer } from '@/entities/viewer';
import { Alert, Button, Skeleton } from '@/shared/ui';
import { gateDecision } from '../model/gate';
import { currentLocation } from '../model/useAuthErrorRedirect';
import { ViewerContext } from '../model/viewer-context';
import { AppShell } from './AppShell';

const GATE_TEXT = {
  checking: '로그인을 확인하고 있어요',
  failed: '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  retry: '다시 시도',
} as const;

type GateState = { kind: 'checking' } | { kind: 'error' } | { kind: 'allow'; viewer: Viewer };

export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    let outcome: { viewer: Viewer } | { error: unknown };
    try {
      outcome = { viewer: await fetchViewer() };
    } catch (error: unknown) {
      outcome = { error };
    }
    const decision = gateDecision(outcome, currentLocation());
    if (decision.kind === 'redirect') router.replace(decision.to);
    else if (decision.kind === 'error') setState({ kind: 'error' });
    else if ('viewer' in outcome) setState({ kind: 'allow', viewer: outcome.viewer });
  }, [router]);

  useEffect(() => {
    void check();
  }, [check]);

  if (state.kind === 'allow') {
    return (
      <ViewerContext.Provider value={state.viewer}>
        <AppShell viewer={state.viewer}>{children}</AppShell>
      </ViewerContext.Provider>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
      {state.kind === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="danger">{GATE_TEXT.failed}</Alert>
          <Button variant="secondary" size="sm" onClick={() => void check()}>
            {GATE_TEXT.retry}
          </Button>
        </div>
      ) : (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{GATE_TEXT.checking}</span>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </main>
  );
}
