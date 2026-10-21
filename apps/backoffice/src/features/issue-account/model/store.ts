// 발급 폼의 상태. 폼 하나마다 스토어 하나를 만든다(`IssueAccountForm` 이 만든다).

import { createStore } from 'zustand/vanilla';
import { type AccountRecord, createAccount } from '@/entities/account';
import { isApiError } from '@/shared/api';
import {
  EMPTY_ISSUE_DRAFT,
  ISSUE_TEXT,
  type IssueAccountDraft,
  type IssueFieldErrors,
  toCreateAccountInput,
  validateIssueDraft,
} from './form';

export type IssueAccountState = {
  draft: IssueAccountDraft;
  fieldErrors: IssueFieldErrors;
  busy: boolean;
  error: string | null;
  setField: <Field extends keyof IssueAccountDraft>(
    field: Field,
    value: IssueAccountDraft[Field],
  ) => void;
  /** 만들면 그 계정을, 보내지 않았거나 실패하면 null. */
  submit: () => Promise<AccountRecord | null>;
  reset: () => void;
};

export function createIssueAccountStore() {
  return createStore<IssueAccountState>()((set, get) => ({
    draft: EMPTY_ISSUE_DRAFT,
    fieldErrors: {},
    busy: false,
    error: null,
    setField: (field, value) =>
      set((state) => {
        const { [field]: _cleared, ...fieldErrors } = state.fieldErrors;
        return { draft: { ...state.draft, [field]: value }, fieldErrors };
      }),
    submit: async () => {
      const { draft, busy } = get();
      if (busy) return null;
      const fieldErrors = validateIssueDraft(draft);
      if (Object.keys(fieldErrors).length > 0) {
        set({ fieldErrors });
        return null;
      }
      set({ busy: true, error: null, fieldErrors: {} });
      try {
        const account = await createAccount(toCreateAccountInput(draft));
        set({ busy: false });
        return account;
      } catch (error: unknown) {
        set({
          busy: false,
          error: isApiError(error)
            ? `${ISSUE_TEXT.failedPrefix}${error.message}`
            : ISSUE_TEXT.networkFailed,
        });
        return null;
      }
    },
    reset: () => set({ draft: EMPTY_ISSUE_DRAFT, fieldErrors: {}, busy: false, error: null }),
  }));
}

export type IssueAccountStore = ReturnType<typeof createIssueAccountStore>;
