import type { Viewer } from './types';

/** 운영 화면을 쓸 수 있는가. 화면 쪽 막음은 편의이고 판정은 서버(403)가 한다. */
export function isAdmin(viewer: Pick<Viewer, 'role'>): boolean {
  return viewer.role === 'admin';
}
