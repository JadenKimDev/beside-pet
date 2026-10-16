/**
 * typeorm-options.ts — shared Postgres DataSource options factory.
 * Used by both the runtime module (TypeOrmModule.forRootAsync + ConfigService)
 * and the CLI DataSource (data-source.ts). Values arrive as an explicit input
 * so neither path reads the environment here. SSL is opt-in (e.g. Supabase);
 * synchronize is always off — schema changes go through migrations, which
 * load by path so the CLI and the runtime resolve the same files.
 */
import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { AccountEntity } from '@/identity/infrastructure/typeorm/account.entity';
import { SessionEntity } from '@/support/infrastructure/persistence/typeorm/session.entity';
import { TurnAnalysisEntity } from '@/support/infrastructure/persistence/typeorm/turn-analysis.entity';

export interface DatabaseOptionsInput {
  url: string;
  ssl: boolean;
}

export const buildDataSourceOptions = (input: DatabaseOptionsInput): DataSourceOptions => ({
  type: 'postgres',
  url: input.url,
  entities: [AccountEntity, SessionEntity, TurnAnalysisEntity],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
  ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
});
