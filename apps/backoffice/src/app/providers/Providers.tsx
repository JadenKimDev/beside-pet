'use client';

import type { ReactNode } from 'react';

/** 클라이언트 전역 프로바이더 자리. 지금은 감쌀 것이 없다. */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
