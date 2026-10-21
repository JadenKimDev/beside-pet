'use client';

import { createContext, useContext } from 'react';
import type { Viewer } from '@/entities/viewer';

/** 가드가 받은 운영자. `AdminGate` 안에서만 값이 있다. */
export const ViewerContext = createContext<Viewer | null>(null);

/** 로그인한 운영자(관리자). `AdminGate` 아래에서만 부른다. */
export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error('useViewer must be called inside AdminGate');
  return viewer;
}
