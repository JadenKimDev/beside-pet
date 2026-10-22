// 서버의 계정 응답(apps/server/src/identity/api/response.rs). 없는 선택 칸은 JSON 에서 빠진다. 이메일 칸은 없다.

/** `entities/viewer` 의 `Role` 과 같은 값. 같은 레이어끼리 가져오지 않으므로 따로 둔다. */
export type AccountRole = 'admin' | 'viewer';

export type AccountStatus = 'pending' | 'active' | 'revoked' | 'deleted';

/** `AccountResponse`: 발급, 승인, 정지, 삭제, 재개, 만료 설정의 응답. `expired` 는 서버가 지금 시각으로 구한다. */
export type AccountRecord = {
  id: string;
  username: string;
  company: string;
  role: AccountRole;
  status: AccountStatus;
  expiresAt?: string;
  expired: boolean;
  createdAt: string;
  lastLoginAt?: string;
  chatLanguage?: 'ko' | 'en';
  /** 정지(소프트 삭제) 시각. 재개하면 빠진다. ISO-8601. */
  deletedAt?: string;
};

/** `AdminAccountResponse`: 목록의 항목. 지금 남은 대화 수와 그 대화들의 마지막 메시지 시각을 더한다. */
export type Account = AccountRecord & {
  sessionCount: number;
  lastActiveAt?: string;
};

/** `POST /v1/admin/accounts` 의 본문(`CreateAccountRequest`). `expiresAt` 은 ISO 시각. */
export type CreateAccountInput = {
  username: string;
  password: string;
  company: string;
  role?: AccountRole;
  expiresAt?: string;
};
