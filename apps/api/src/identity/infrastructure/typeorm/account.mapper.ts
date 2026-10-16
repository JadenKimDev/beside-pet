/**
 * account.mapper.ts — converts between the AccountSnapshot (domain boundary) and
 * the AccountEntity (TypeORM row). Keeps the domain free of persistence concerns.
 */
import type { AccountSnapshot } from '@/identity/domain/model/account-snapshot';
import { AccountEntity } from './account.entity';

export const toAccountEntity = (snapshot: AccountSnapshot): AccountEntity => {
  const entity = new AccountEntity();
  entity.id = snapshot.id;
  entity.username = snapshot.username;
  entity.passwordHash = snapshot.passwordHash;
  entity.company = snapshot.company;
  entity.role = snapshot.role;
  entity.status = snapshot.status;
  entity.createdAt = snapshot.createdAt;
  entity.lastLoginAt = snapshot.lastLoginAt;
  entity.expiresAt = snapshot.expiresAt;
  entity.chatLanguage = snapshot.chatLanguage;
  return entity;
};

export const toAccountSnapshot = (entity: AccountEntity): AccountSnapshot => ({
  id: entity.id,
  username: entity.username,
  passwordHash: entity.passwordHash,
  company: entity.company,
  role: entity.role,
  status: entity.status,
  createdAt: entity.createdAt,
  lastLoginAt: entity.lastLoginAt,
  expiresAt: entity.expiresAt,
  chatLanguage: entity.chatLanguage,
});
