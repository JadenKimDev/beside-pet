/**
 * postgres-account.repository.ts — Postgres implementation of the account port.
 * Stores/restores via the AccountSnapshot, so the domain stays unchanged; this is
 * a drop-in swap for the in-memory adapter behind the same ACCOUNT_REPOSITORY token.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import { Account } from '@/identity/domain/model/account';
import type { AccountRepository } from '@/identity/domain/port/account.repository';
import { AccountEntity } from './account.entity';
import { toAccountEntity, toAccountSnapshot } from './account.mapper';

@Injectable()
export class PostgresAccountRepository implements AccountRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repo(): Repository<AccountEntity> {
    return this.dataSource.getRepository(AccountEntity);
  }

  async save(account: Account): Promise<void> {
    await this.repo.save(toAccountEntity(account.snapshot()));
  }

  async findById(id: string): Promise<Account | undefined> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? Account.rehydrate(toAccountSnapshot(entity)) : undefined;
  }

  async findByUsername(username: string): Promise<Account | undefined> {
    const entity = await this.repo.findOne({ where: { username } });
    return entity ? Account.rehydrate(toAccountSnapshot(entity)) : undefined;
  }

  async list(): Promise<Account[]> {
    const entities = await this.repo.find();
    return entities.map((entity) => Account.rehydrate(toAccountSnapshot(entity)));
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
