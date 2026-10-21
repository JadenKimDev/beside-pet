'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { chromeFor } from './chrome';

/**
 * 로그인이 필요한 경로(chrome.ts 의 `protected`)를 지킨다. 로그인 확인이 끝났는데 로그인 정보가 없으면
 * 첫 화면으로 보내고, 판정 전에는 화면을 그리지 않는다. 공개 경로는 그대로 그리고 로그인 확인도 하지 않는다.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const isProtected = chromeFor(usePathname()).protected;
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const principal = useAuthStore((s) => s.principal);
  const init = useAuthStore((s) => s.init);
  const asked = useRef(false);

  useEffect(() => {
    if (!isProtected || ready || asked.current) return;
    asked.current = true;
    void init();
  }, [isProtected, ready, init]);

  useEffect(() => {
    if (isProtected && ready && !principal) router.replace('/');
  }, [isProtected, ready, principal, router]);

  if (isProtected && !(ready && principal)) return null;
  return <>{children}</>;
}
