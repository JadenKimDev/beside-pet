// 로그인 뒤 갈 곳. 관리자면 `next`(같은 출처의 경로일 때만) 또는 `/models`, 아니면 권한 없음.
import type { Role } from '@/entities/viewer';

const HOME = '/models';
const AUTH_PAGES = ['/login', '/forbidden'];

/** 로그인 뒤 되돌아갈 경로로 써도 되는가. 다른 출처로 보내는 값(`//`, `/\`, 스킴)과 인증 화면은 버린다. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  const path = next.split(/[?#]/)[0];
  if (AUTH_PAGES.includes(path)) return null;
  return next;
}

export function loginDestination(role: Role, next: string | null | undefined): string {
  if (role !== 'admin') return '/forbidden';
  return safeNext(next) ?? HOME;
}
