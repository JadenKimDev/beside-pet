// `POST /v1/auth/logout`(204, 서버가 쿠키를 지우는 Set-Cookie 를 준다).
import { api, isUnauthorized } from '@/shared/api';

export function logout(): Promise<void> {
  return api.post<void>('/v1/auth/logout');
}

/** 로그아웃이 끝났는가. 이미 로그인이 끝난 401 도 끝난 것으로 본다. 서버나 네트워크가 실패하면 false. */
export async function signOut(): Promise<boolean> {
  try {
    await logout();
    return true;
  } catch (error: unknown) {
    return isUnauthorized(error);
  }
}
