/**
 * features/admin/admin.store.ts — admin console state + use cases (actions).
 * Account management only; identity/auth lives in features/auth (auth.store).
 * Feature-Sliced: one store, components subscribe via selectors. Absence = `undefined`.
 * Each mutation calls the backend then refreshes the list (backend is the source of truth).
 */
import { create } from 'zustand';
import * as api from './admin.api';
import type { Account, CreateAccountInput } from './admin.types';

interface AdminState {
  accounts: Account[];
  busy: boolean;
  error?: string;

  refresh: () => Promise<void>;
  create: (input: CreateAccountInput) => Promise<void>;
  approve: (id: string) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  softDelete: (id: string) => Promise<void>;
  reactivate: (id: string) => Promise<void>;
  setExpiry: (id: string, expiresAt?: string) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => {
  /** Run a mutation, surface errors, then refresh the account list. */
  const mutate = async <T>(op: () => Promise<T>): Promise<void> => {
    set({ busy: true, error: undefined });
    try {
      await op();
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      set({ busy: false });
    }
  };

  return {
    accounts: [],
    busy: false,
    error: undefined,

    async refresh() {
      const accounts = await api.listAccounts();
      set({ accounts });
    },

    create: (input) => mutate(() => api.createAccount(input)),
    approve: (id) => mutate(() => api.approveAccount(id)),
    revoke: (id) => mutate(() => api.revokeAccount(id)),
    softDelete: (id) => mutate(() => api.softDeleteAccount(id)),
    reactivate: (id) => mutate(() => api.reactivateAccount(id)),
    setExpiry: (id, expiresAt) => mutate(() => api.setAccountExpiry(id, expiresAt)),
  };
});
