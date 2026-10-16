/**
 * features/auth/auth.store.ts — app-wide auth state + use cases (actions).
 * Feature-Sliced: one store, components subscribe via selectors. Absence = `undefined`.
 * Unlike the admin store, this never loads the account list — a viewer can sign in
 * without touching admin-only endpoints. Role-based routing lives in the pages.
 */
import { create } from 'zustand';
import type { Locale } from '@/i18n/config';
import * as api from './auth.api';
import type { Principal } from './auth.types';

interface AuthState {
  principal?: Principal;
  ready: boolean; // initial /me check finished
  busy: boolean; // a login/setup is in flight
  error?: string;
  setupRequired: boolean; // backend has no admin yet → show first-run setup

  /** A sign-up request was submitted and now awaits admin approval. */
  registered: boolean;

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, company: string) => Promise<void>;
  resetRegistered: () => void;
  setup: (token: string, username: string, password: string) => Promise<void>;
  setChatLanguage: (language: Locale) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  principal: undefined,
  ready: false,
  busy: false,
  error: undefined,
  setupRequired: false,
  registered: false,

  async init() {
    try {
      const principal = await api.me();
      set({ principal, setupRequired: false });
    } catch {
      set({ principal: undefined });
      // Signed out — check whether the backend still needs its first admin.
      try {
        const status = await api.setupStatus();
        set({ setupRequired: status.required });
      } catch {
        set({ setupRequired: false });
      }
    } finally {
      set({ ready: true });
    }
  },

  async login(username, password) {
    set({ busy: true, error: undefined });
    try {
      await api.login(username, password);
      const principal = await api.me();
      set({ principal });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      set({ busy: false });
    }
  },

  async register(username, password, company) {
    set({ busy: true, error: undefined });
    try {
      await api.register(username, password, company);
      set({ registered: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      set({ busy: false });
    }
  },

  resetRegistered() {
    set({ registered: false, error: undefined });
  },

  async setup(token, username, password) {
    set({ busy: true, error: undefined });
    try {
      await api.setup(token, username, password);
      const principal = await api.me();
      set({ principal, setupRequired: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Request failed.' });
    } finally {
      set({ busy: false });
    }
  },

  async setChatLanguage(language) {
    try {
      const principal = await api.updateChatLanguage(language);
      set({ principal });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Request failed.' });
    }
  },

  async logout() {
    try {
      await api.logout();
    } finally {
      set({ principal: undefined });
    }
  },
}));
