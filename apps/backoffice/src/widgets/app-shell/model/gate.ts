// 관리자 가드의 판정. 화면 쪽 막음은 편의이고 판정은 서버다: 관리자 API 는 관리자가 아니면 `403 Insufficient role`
// 을 돌려준다. 이 가드는 그 앞에서 로그인 화면이나 권한 없음 화면으로 미리 보내 줄 뿐이다.
import { isAdmin, type Viewer } from '@/entities/viewer';
import { isForbidden, isUnauthorized } from '@/shared/api';

export const LOGIN_PATH = '/login';
export const FORBIDDEN_PATH = '/forbidden';

/** `GET /v1/auth/me` 의 결과: 받은 운영자 또는 던져진 오류. */
export type ViewerOutcome = { viewer: Viewer } | { error: unknown };

export type GateDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'error' };

/** 로그인 화면의 주소. 지금 경로와 질의를 `next` 로 실어 로그인 뒤 되돌아오게 한다. */
export function loginPath(current: string): string {
  if (current === '/' || current === LOGIN_PATH || current.startsWith(`${LOGIN_PATH}?`)) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?next=${encodeURIComponent(current)}`;
}

/** 데이터 호출의 오류가 401 이면 로그인, 403 이면 권한 없음 주소. 그 밖은 null(화면이 오류를 보인다). */
export function authErrorTarget(error: unknown, current: string): string | null {
  if (isUnauthorized(error)) return loginPath(current);
  if (isForbidden(error)) return FORBIDDEN_PATH;
  return null;
}

export function gateDecision(outcome: ViewerOutcome, current: string): GateDecision {
  if ('viewer' in outcome) {
    return isAdmin(outcome.viewer) ? { kind: 'allow' } : { kind: 'redirect', to: FORBIDDEN_PATH };
  }
  const to = authErrorTarget(outcome.error, current);
  return to ? { kind: 'redirect', to } : { kind: 'error' };
}
