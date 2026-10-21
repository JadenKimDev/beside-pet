// Route Handler 가 GITHUB_TOKEN 없이 띄워졌을 때의 응답(503 과 이 문구). 서버의 TOKEN_MISSING_MESSAGE 와 같은 값이고,
// 값을 서버 전용 모듈에서 가져올 수 없어 여기 다시 적는다. 같은지는 token.test.ts 가 본다.
import { isApiError } from '@/shared/api';

export const GITHUB_TOKEN_MISSING = 'GITHUB_TOKEN is not set';

/** 토큰이 없어 GitHub 를 부를 수 없다. 화면은 오류 대신 "토큰이 없다" 안내를 보인다. */
export function isTokenMissing(error: unknown): boolean {
  return isApiError(error) && error.status === 503 && error.message === GITHUB_TOKEN_MISSING;
}
