/**
 * password-hasher.port.ts — password hashing port (out). No storing the raw value; comparison only.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
