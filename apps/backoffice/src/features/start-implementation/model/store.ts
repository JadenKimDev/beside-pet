// 라벨 붙이기의 상태: idle → pending → done | error. 보내는 중과 끝난 뒤에는 다시 받지 않고, 실패하면 다시 누를 수 있다.
import { createStore } from 'zustand/vanilla';
import { addIssueLabel, type IssueLabel, isTokenMissing } from '@/entities/issue';
import { isApiError } from '@/shared/api';
import { RUN_IMPLEMENT_LABEL } from './visibility';

export type StartImplementationStatus = 'idle' | 'pending' | 'done' | 'error';

export const START_IMPLEMENTATION_TEXT = {
  failedPrefix: '라벨을 붙이지 못했어요: ',
  tokenMissing: 'GitHub 토큰이 없어 라벨을 붙일 수 없어요.',
  networkFailed: '라벨을 붙이지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

export type StartImplementationState = {
  status: StartImplementationStatus;
  error: string | null;
  /** 붙인 뒤 그 이슈의 라벨 전부. 끝나기 전에는 null. */
  labels: IssueLabel[] | null;
  /** 끝나면 라벨 전부를, 바쁘거나 이미 끝났거나 실패하면 null. */
  start: (issueNumber: number) => Promise<IssueLabel[] | null>;
};

function failureText(error: unknown): string {
  if (isTokenMissing(error)) return START_IMPLEMENTATION_TEXT.tokenMissing;
  if (isApiError(error)) return `${START_IMPLEMENTATION_TEXT.failedPrefix}${error.message}`;
  return START_IMPLEMENTATION_TEXT.networkFailed;
}

export function createStartImplementationStore() {
  return createStore<StartImplementationState>()((set, get) => ({
    status: 'idle',
    error: null,
    labels: null,
    start: async (issueNumber) => {
      const { status } = get();
      if (status === 'pending' || status === 'done') return null;
      set({ status: 'pending', error: null });
      try {
        const { labels } = await addIssueLabel(issueNumber, RUN_IMPLEMENT_LABEL);
        set({ status: 'done', labels });
        return labels;
      } catch (error: unknown) {
        set({ status: 'error', error: failureText(error) });
        return null;
      }
    },
  }));
}

export type StartImplementationStore = ReturnType<typeof createStartImplementationStore>;
