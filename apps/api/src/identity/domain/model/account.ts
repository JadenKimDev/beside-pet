/**
 * account.ts — the account aggregate root. Issued by admin (username, password, company); only admin can
 * revoke/soft-delete/reactivate too. The raw password is never stored (hash only). An account may carry an
 * absolute expiry instant. State transitions happen only through methods.
 */
import { DateTime } from 'luxon';
import type { Locale } from '@/shared/locale';
import type { AccountApplicationInput } from './account-application-input';
import type { AccountIssueInput } from './account-issue-input';
import type { AccountSnapshot } from './account-snapshot';
import type { AccountStatus } from './account-status';
import type { Role } from './role';

export class Account {
  private constructor(
    readonly id: string,
    readonly username: string,
    private _passwordHash: string,
    readonly company: string,
    readonly role: Role,
    private _status: AccountStatus,
    readonly createdAt: string,
    private _lastLoginAt: string | undefined,
    private _expiresAt: string | undefined,
    private _chatLanguage: Locale | undefined,
  ) {}

  /** admin issues a new viewer/admin account. */
  static issue(input: AccountIssueInput): Account {
    return new Account(
      input.id,
      input.username,
      input.passwordHash,
      input.company,
      input.role,
      'active',
      input.createdAt,
      undefined,
      input.expiresAt,
      undefined,
    );
  }

  /** A visitor applies for an account — starts pending until an admin approves. */
  static applyFor(input: AccountApplicationInput): Account {
    return new Account(
      input.id,
      input.username,
      input.passwordHash,
      input.company,
      'viewer',
      'pending',
      input.createdAt,
      undefined,
      undefined,
      undefined,
    );
  }

  static rehydrate(snapshot: AccountSnapshot): Account {
    return new Account(
      snapshot.id,
      snapshot.username,
      snapshot.passwordHash,
      snapshot.company,
      snapshot.role,
      snapshot.status,
      snapshot.createdAt,
      snapshot.lastLoginAt,
      snapshot.expiresAt,
      snapshot.chatLanguage,
    );
  }

  get passwordHash(): string {
    return this._passwordHash;
  }
  get status(): AccountStatus {
    return this._status;
  }
  get lastLoginAt(): string | undefined {
    return this._lastLoginAt;
  }
  get expiresAt(): string | undefined {
    return this._expiresAt;
  }
  /** Conversation language preference (independent of the app UI language). */
  get chatLanguage(): Locale | undefined {
    return this._chatLanguage;
  }

  setChatLanguage(language: Locale): void {
    this._chatLanguage = language;
  }

  recordLogin(at: string): void {
    this._lastLoginAt = at;
  }

  revoke(): void {
    this._status = 'revoked';
  }

  softDelete(): void {
    this._status = 'deleted';
  }

  reactivate(): void {
    this._status = 'active';
  }

  /** Admin approves a pending application (→ active). */
  approve(): void {
    this._status = 'active';
  }

  /** Sets or clears (undefined) the absolute UTC expiry instant. */
  setExpiry(expiresAt?: string): void {
    this._expiresAt = expiresAt;
  }

  /** True once the absolute expiry instant has passed. Pure: the caller supplies the current instant. */
  isExpired(nowMillis: number): boolean {
    return (
      this._expiresAt !== undefined &&
      DateTime.fromISO(this._expiresAt, { zone: 'utc' }).toMillis() <= nowMillis
    );
  }

  snapshot(): AccountSnapshot {
    return {
      id: this.id,
      username: this.username,
      passwordHash: this._passwordHash,
      company: this.company,
      role: this.role,
      status: this._status,
      createdAt: this.createdAt,
      lastLoginAt: this._lastLoginAt,
      expiresAt: this._expiresAt,
      chatLanguage: this._chatLanguage,
    };
  }
}
