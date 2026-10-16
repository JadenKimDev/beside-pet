/**
 * 1730000000000-initial-schema.ts — initial Postgres schema (scheme "C").
 * accounts: normalized. sessions: scalar progress + JSONB document parts.
 * turn_analyses: per-turn analysis promoted to queryable columns (+ indexes) so
 * insight queries (crisis rate, task-reach) are plain SQL aggregation.
 * sessions.report holds the write-once mind report (generated on first request).
 * Runs automatically on connect (migrationsRun) or via the TypeORM CLI.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1730000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" varchar PRIMARY KEY,
        "username" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "company" varchar NOT NULL,
        "role" varchar NOT NULL,
        "status" varchar NOT NULL,
        "created_at" timestamptz NOT NULL,
        "last_login_at" timestamptz,
        "expires_at" timestamptz,
        "chat_language" varchar
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_accounts_username" ON "accounts" ("username")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" varchar PRIMARY KEY,
        "owner_id" varchar NOT NULL,
        "task" integer NOT NULL,
        "retry_count" integer NOT NULL,
        "support_level" integer NOT NULL,
        "closed" boolean NOT NULL,
        "grief_profile" jsonb NOT NULL,
        "history" jsonb NOT NULL,
        "plan" jsonb,
        "summary" jsonb,
        "report" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_owner" ON "sessions" ("owner_id")`);

    await queryRunner.query(`
      CREATE TABLE "turn_analyses" (
        "session_id" varchar NOT NULL,
        "seq" integer NOT NULL,
        "at" timestamptz NOT NULL,
        "task" integer NOT NULL,
        "phase" varchar NOT NULL,
        "risk_level" integer NOT NULL,
        "risk_detected_by" varchar NOT NULL,
        "from_task" integer NOT NULL,
        "to_task" integer NOT NULL,
        "advanced" boolean NOT NULL,
        "retry_count" integer NOT NULL,
        "knowledge" jsonb NOT NULL,
        "supervision" jsonb,
        PRIMARY KEY ("session_id", "seq")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_turn_analyses_session" ON "turn_analyses" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_turn_analyses_risk" ON "turn_analyses" ("risk_level")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_turn_analyses_to_task" ON "turn_analyses" ("to_task")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "turn_analyses"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
