'use client';

import { useState } from 'react';
import { useStore } from 'zustand';
import type { Account } from '@/entities/account';
import { accountActions, type ModerationAction } from './actions';
import { createModerationStore, type ModerationRequest, type ModerationResult } from './moderation';

export type ModerateAccountOptions = {
  /** 동작이 끝났다. 호출자는 목록을 다시 받는다. */
  onChanged: (result: ModerationResult) => void;
  /** 동작이 실패했다. 문구는 "처리하지 못했어요: " + 서버 문구. 화면 위쪽 Alert 에 보인다. */
  onError?: (message: string) => void;
};

export type ModerateAccount = {
  actions: ModerationAction[];
  busy: ModerationRequest['kind'] | null;
  error: string | null;
  perform: (request: ModerationRequest) => Promise<ModerationResult | null>;
};

/** 한 계정에 대한 동작 묶음. 행마다 하나. */
export function useModerateAccount(
  account: Account,
  { onChanged, onError }: ModerateAccountOptions,
): ModerateAccount {
  const [store] = useState(createModerationStore);
  const { busy, error } = useStore(store);

  async function perform(request: ModerationRequest) {
    const result = await store.getState().run(account.id, request);
    if (result) onChanged(result);
    else {
      const message = store.getState().error;
      if (message) onError?.(message);
    }
    return result;
  }

  return { actions: accountActions(account), busy, error, perform };
}
