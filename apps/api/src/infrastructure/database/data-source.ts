/**
 * data-source.ts — TypeORM CLI DataSource (migration generate/run/revert).
 * The running app configures TypeORM via ConfigService (PersistenceModule);
 * the CLI runs outside the Nest DI container, so this file is the one place
 * that reads the environment directly (dotenv, NODE_ENV-selected file).
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm-options';

config({ path: process.env.NODE_ENV === 'development' ? '.env.development' : '.env' });

export default new DataSource(
  buildDataSourceOptions({
    url: process.env.DATABASE_URL ?? '',
    ssl: process.env.DATABASE_SSL === 'true',
  }),
);
