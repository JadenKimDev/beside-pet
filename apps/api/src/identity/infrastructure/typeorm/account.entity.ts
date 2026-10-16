/**
 * account.entity.ts — TypeORM persistence model for an account (normalized).
 * Separate from the domain Account aggregate; the mapper converts between them.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { AccountStatus } from '@/identity/domain/model/account-status';
import type { Role } from '@/identity/domain/model/role';
import { isoInstant, nullable } from '@/infrastructure/database/transformers';
import type { Locale } from '@/shared/locale';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @Index('uq_accounts_username', { unique: true })
  @Column('varchar')
  username!: string;

  @Column('varchar', { name: 'password_hash' })
  passwordHash!: string;

  @Column('varchar')
  company!: string;

  @Column('varchar')
  role!: Role;

  @Column('varchar')
  status!: AccountStatus;

  @Column('timestamptz', { name: 'created_at', transformer: isoInstant })
  createdAt!: string;

  @Column('timestamptz', { name: 'last_login_at', nullable: true, transformer: isoInstant })
  lastLoginAt?: string;

  @Column('timestamptz', { name: 'expires_at', nullable: true, transformer: isoInstant })
  expiresAt?: string;

  @Column('varchar', { name: 'chat_language', nullable: true, transformer: nullable<Locale>() })
  chatLanguage?: Locale;
}
