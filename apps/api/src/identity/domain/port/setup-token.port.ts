/**
 * setup-token.port.ts — first-run setup gate port (out).
 * Holds the one-time token issued at boot when no admin account exists, so the
 * operator can bootstrap the first admin without credentials in env files.
 */
export interface SetupTokenGate {
  /** True while the one-time token is outstanding (no admin account yet). */
  isPending(): boolean;
  /** Redeems the token. Returns false on mismatch; success invalidates it. */
  redeem(candidate: string): boolean;
}
