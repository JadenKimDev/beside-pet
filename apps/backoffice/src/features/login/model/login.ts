// 로그인 폼의 상태. 빈 칸은 보내지 않고, 401 이면 비밀번호만 비운다(화면 안 3절).
// 관리자인지는 여기서 보지 않는다. 성공 뒤 views 가 `fetchViewer` 와 `isAdmin` 으로 판정한다.

import { createStore } from 'zustand/vanilla';
import type { AccountRecord } from '@/entities/account';
import { isUnauthorized } from '@/shared/api';
import { login } from '../api/login';

export const LOGIN_TEXT = {
  username: '아이디',
  password: '비밀번호',
  submit: '로그인',
  submitting: '로그인하는 중…',
  usernameRequired: '아이디를 입력해 주세요.',
  passwordRequired: '비밀번호를 입력해 주세요.',
  wrongCredentials: '아이디나 비밀번호가 맞지 않아요.',
  failed: '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

export type LoginField = 'username' | 'password';

export type LoginState = {
  username: string;
  password: string;
  fieldErrors: Partial<Record<LoginField, string>>;
  busy: boolean;
  error: string | null;
  setField: (field: LoginField, value: string) => void;
  /** 성공하면 계정을, 보내지 않았거나 실패하면 null. */
  submit: () => Promise<AccountRecord | null>;
};

export function createLoginStore() {
  return createStore<LoginState>()((set, get) => ({
    username: '',
    password: '',
    fieldErrors: {},
    busy: false,
    error: null,
    setField: (field, value) =>
      set((state) => {
        const { [field]: _cleared, ...fieldErrors } = state.fieldErrors;
        return field === 'username'
          ? { username: value, fieldErrors }
          : { password: value, fieldErrors };
      }),
    submit: async () => {
      const { username, password, busy } = get();
      if (busy) return null;
      const fieldErrors: LoginState['fieldErrors'] = {};
      if (!username.trim()) fieldErrors.username = LOGIN_TEXT.usernameRequired;
      if (!password) fieldErrors.password = LOGIN_TEXT.passwordRequired;
      if (fieldErrors.username || fieldErrors.password) {
        set({ fieldErrors });
        return null;
      }
      set({ busy: true, error: null, fieldErrors: {} });
      try {
        const account = await login({ username: username.trim(), password });
        set({ busy: false });
        return account;
      } catch (error: unknown) {
        set(
          isUnauthorized(error)
            ? { busy: false, error: LOGIN_TEXT.wrongCredentials, password: '' }
            : { busy: false, error: LOGIN_TEXT.failed },
        );
        return null;
      }
    },
  }));
}

export type LoginStore = ReturnType<typeof createLoginStore>;
