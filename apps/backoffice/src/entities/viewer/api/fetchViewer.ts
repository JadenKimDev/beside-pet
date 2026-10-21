import { api } from '@/shared/api';
import type { Viewer } from '../model/types';

/** 로그인한 계정. 로그인이 없으면 `ApiError`(401)를 던진다. */
export function fetchViewer(): Promise<Viewer> {
  return api.get<Viewer>('/v1/auth/me');
}
