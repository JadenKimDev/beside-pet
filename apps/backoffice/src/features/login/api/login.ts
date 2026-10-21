// `POST /v1/auth/login`(apps/server/src/identity/api.rs). 본문은 `LoginRequest`, 응답은 `AccountResponse` 이고
// 인증 쿠키는 서버가 Set-Cookie 로 준다.
import type { AccountRecord } from '@/entities/account';
import { api } from '@/shared/api';

export type LoginInput = { username: string; password: string };

export function login(input: LoginInput): Promise<AccountRecord> {
  return api.post<AccountRecord>('/v1/auth/login', input);
}
