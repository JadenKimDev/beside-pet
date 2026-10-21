// 관리자 계정 API(apps/server/src/identity/api.rs 의 `/v1/admin/accounts` 경로들).
import { api } from '@/shared/api';
import type { Account, AccountRecord, CreateAccountInput } from '../model/types';

const BASE = '/v1/admin/accounts';
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export function listAccounts(): Promise<Account[]> {
  return api.get<Account[]>(BASE);
}

export function createAccount(input: CreateAccountInput): Promise<AccountRecord> {
  return api.post<AccountRecord>(BASE, input);
}

export function approveAccount(id: string): Promise<AccountRecord> {
  return api.post<AccountRecord>(`${one(id)}/approve`);
}

export function revokeAccount(id: string): Promise<AccountRecord> {
  return api.post<AccountRecord>(`${one(id)}/revoke`);
}

export function softDeleteAccount(id: string): Promise<AccountRecord> {
  return api.post<AccountRecord>(`${one(id)}/soft-delete`);
}

export function reactivateAccount(id: string): Promise<AccountRecord> {
  return api.post<AccountRecord>(`${one(id)}/reactivate`);
}

/** 만료를 정한다. `expiresAt` 이 없으면 본문 `{}` 로 보내 만료를 지운다. */
export function setAccountExpiry(id: string, expiresAt?: string): Promise<AccountRecord> {
  return api.patch<AccountRecord>(`${one(id)}/expiry`, { expiresAt });
}

/** 완전 삭제(204). */
export function deleteAccount(id: string): Promise<void> {
  return api.delete<void>(one(id));
}
