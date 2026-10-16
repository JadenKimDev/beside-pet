/**
 * features/admin/admin.api.ts — real backend client for the admin console.
 * Routes only: the shared transport (lib/http) owns the base URL, the httpOnly
 * cookie credentials, and error extraction.
 */
import { http } from '@/lib/http';
import type { Account, CreateAccountInput } from './admin.types';

export const listAccounts = (): Promise<Account[]> => http.get('/v1/admin/accounts');

export const createAccount = (input: CreateAccountInput): Promise<Account> =>
  http.post('/v1/admin/accounts', input);

export const approveAccount = (id: string): Promise<Account> =>
  http.post(`/v1/admin/accounts/${id}/approve`);

export const revokeAccount = (id: string): Promise<Account> =>
  http.post(`/v1/admin/accounts/${id}/revoke`);

export const softDeleteAccount = (id: string): Promise<Account> =>
  http.post(`/v1/admin/accounts/${id}/soft-delete`);

export const reactivateAccount = (id: string): Promise<Account> =>
  http.post(`/v1/admin/accounts/${id}/reactivate`);

export const setAccountExpiry = (id: string, expiresAt?: string): Promise<Account> =>
  http.patch(`/v1/admin/accounts/${id}/expiry`, { expiresAt });
