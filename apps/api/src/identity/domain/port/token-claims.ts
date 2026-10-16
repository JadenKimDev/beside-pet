/**
 * token-claims.ts — minimal identity payload carried in the session token (JWT).
 * The guard re-fetches full account details from the repository, so the payload stays small.
 */
export interface TokenClaims {
  sub: string; // accountId
  role: string;
}
