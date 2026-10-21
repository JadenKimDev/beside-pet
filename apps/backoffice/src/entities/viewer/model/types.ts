// `GET /v1/auth/me` 의 응답. 서버의 `MeResponse`(apps/server/src/identity/api/response.rs)는 `AccountResponse` 의
// 칸을 펼치고 `hasProfile` 을 더한다. 없는 선택 칸은 JSON 에서 빠진다.

export type Role = 'admin' | 'viewer';

export type Viewer = {
  id: string;
  username: string;
  company: string;
  role: Role;
  status: 'pending' | 'active' | 'revoked' | 'deleted';
  expiresAt?: string;
  expired: boolean;
  createdAt: string;
  lastLoginAt?: string;
  chatLanguage?: 'ko' | 'en';
  hasProfile: boolean;
};
