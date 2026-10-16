/**
 * token-signer.port.ts — session token (JWT) issuance/verification port (out).
 * The payload holds only the minimal identity set — the guard re-fetches details from the repository.
 */
import type { TokenClaims } from './token-claims';

export interface TokenSigner {
  sign(claims: TokenClaims): string;
  verify(token: string): TokenClaims | undefined;
}
