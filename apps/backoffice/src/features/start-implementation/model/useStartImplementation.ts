'use client';

import { useState } from 'react';
import { useStore } from 'zustand';
import type { IssueLabel } from '@/entities/issue';
import { createStartImplementationStore, type StartImplementationStatus } from './store';

export type StartImplementationOptions = {
  /** 라벨이 붙었다. 호출자는 보드나 상세를 다시 받거나 카드의 라벨을 바꾼다. */
  onStarted?: (labels: IssueLabel[]) => void;
  /** 실패했다. 문구는 START_IMPLEMENTATION_TEXT 의 것. */
  onError?: (message: string) => void;
};

export type StartImplementation = {
  status: StartImplementationStatus;
  error: string | null;
  start: () => Promise<IssueLabel[] | null>;
};

/** 이슈 하나에 대한 "구현 시작". 카드나 상세마다 하나. */
export function useStartImplementation(
  issueNumber: number,
  { onStarted, onError }: StartImplementationOptions = {},
): StartImplementation {
  const [store] = useState(createStartImplementationStore);
  const { status, error } = useStore(store);

  async function start() {
    const labels = await store.getState().start(issueNumber);
    if (labels) onStarted?.(labels);
    else {
      const message = store.getState().error;
      if (message) onError?.(message);
    }
    return labels;
  }

  return { status, error, start };
}
