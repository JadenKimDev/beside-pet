/**
 * persistence.module.ts — TypeORM + Postgres persistence (global).
 * DATABASE_URL is required: conversations are the product's record, so the
 * server refuses to boot without a database instead of degrading silently.
 * Configuration flows through ConfigService (forRootAsync) — no direct env
 * reads. Binds the ACCOUNT_REPOSITORY / SESSION_REPOSITORY tokens, so the
 * bounded contexts inject their ports without knowing the adapter.
 */
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ACCOUNT_REPOSITORY } from '@/identity/domain/port/tokens';
import { PostgresAccountRepository } from '@/identity/infrastructure/typeorm/postgres-account.repository';
import { SESSION_REPOSITORY } from '@/support/domain/port/tokens';
import { PostgresSessionRepository } from '@/support/infrastructure/persistence/typeorm/postgres-session.repository';
import { buildDataSourceOptions } from './typeorm-options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL') ?? '';
        if (url.length === 0) {
          throw new Error('DATABASE_URL is required — the server persists to Postgres only.');
        }
        return {
          ...buildDataSourceOptions({ url, ssl: config.get<string>('DATABASE_SSL') === 'true' }),
          migrationsRun: true,
        };
      },
    }),
  ],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: PostgresAccountRepository },
    { provide: SESSION_REPOSITORY, useClass: PostgresSessionRepository },
  ],
  exports: [ACCOUNT_REPOSITORY, SESSION_REPOSITORY],
})
export class PersistenceModule {}
