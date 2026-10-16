/**
 * tokens.ts — identity DI tokens. port → adapter injection identifiers.
 */
export const ACCOUNT_REPOSITORY = Symbol('AccountRepository');
export const PASSWORD_HASHER = Symbol('PasswordHasher');
export const TOKEN_SIGNER = Symbol('TokenSigner');
export const SETUP_TOKEN_GATE = Symbol('SetupTokenGate');
