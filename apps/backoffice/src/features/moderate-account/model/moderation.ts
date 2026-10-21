// 한 계정에 대한 동작의 요청과 상태. 요청 중에는 다른 동작을 받지 않는다(중복 클릭 막기).

import { createStore } from 'zustand/vanilla';
import {
  type AccountRecord,
  approveAccount,
  deleteAccount,
  reactivateAccount,
  revokeAccount,
  setAccountExpiry,
  softDeleteAccount,
} from '@/entities/account';
import { isApiError } from '@/shared/api';

export type ModerationRequest =
  | { kind: 'approve' | 'revoke' | 'reactivate' | 'restore' | 'softDelete' | 'purge' }
  | { kind: 'setExpiry'; expiresAt?: string };

/** 서버가 돌려준 계정, 또는 완전 삭제로 없어진 계정의 id. */
export type ModerationResult =
  | { kind: 'updated'; account: AccountRecord }
  | { kind: 'purged'; id: string };

export const MODERATION_TEXT = {
  failedPrefix: '처리하지 못했어요: ',
  networkFailed: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

async function send(id: string, request: ModerationRequest): Promise<ModerationResult> {
  const updated = (account: AccountRecord): ModerationResult => ({ kind: 'updated', account });
  switch (request.kind) {
    case 'approve':
      return updated(await approveAccount(id));
    case 'revoke':
      return updated(await revokeAccount(id));
    case 'reactivate':
    case 'restore':
      return updated(await reactivateAccount(id));
    case 'softDelete':
      return updated(await softDeleteAccount(id));
    case 'setExpiry':
      return updated(await setAccountExpiry(id, request.expiresAt));
    case 'purge':
      await deleteAccount(id);
      return { kind: 'purged', id };
  }
}

export type ModerationState = {
  /** 지금 보내는 동작. 없으면 null. */
  busy: ModerationRequest['kind'] | null;
  error: string | null;
  /** 끝나면 결과를, 바쁘거나 실패하면 null. */
  run: (id: string, request: ModerationRequest) => Promise<ModerationResult | null>;
  clearError: () => void;
};

export function createModerationStore() {
  return createStore<ModerationState>()((set, get) => ({
    busy: null,
    error: null,
    run: async (id, request) => {
      if (get().busy) return null;
      set({ busy: request.kind, error: null });
      try {
        const result = await send(id, request);
        set({ busy: null });
        return result;
      } catch (error: unknown) {
        set({
          busy: null,
          error: isApiError(error)
            ? `${MODERATION_TEXT.failedPrefix}${error.message}`
            : MODERATION_TEXT.networkFailed,
        });
        return null;
      }
    },
    clearError: () => set({ error: null }),
  }));
}

export type ModerationStore = ReturnType<typeof createModerationStore>;
