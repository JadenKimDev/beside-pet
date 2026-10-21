import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { TOKEN_MISSING_MESSAGE } from '@/shared/github';
import { GITHUB_TOKEN_MISSING, isTokenMissing } from './token';

describe('isTokenMissing', () => {
  it('uses the same text the Route Handler sends', () => {
    expect(GITHUB_TOKEN_MISSING).toBe(TOKEN_MISSING_MESSAGE);
  });

  it('is true for 503 with the token-missing text', () => {
    expect(isTokenMissing(new ApiError(503, GITHUB_TOKEN_MISSING))).toBe(true);
  });

  it('is false for another 503, other statuses and other errors', () => {
    expect(isTokenMissing(new ApiError(503, 'Service Unavailable'))).toBe(false);
    expect(isTokenMissing(new ApiError(500, GITHUB_TOKEN_MISSING))).toBe(false);
    expect(isTokenMissing(new ApiError(401, 'Bad credentials'))).toBe(false);
    expect(isTokenMissing(new TypeError('fetch failed'))).toBe(false);
    expect(isTokenMissing(undefined)).toBe(false);
  });
});
