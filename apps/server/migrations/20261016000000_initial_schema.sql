-- 초기 스키마. TS API 의 TypeORM 마이그레이션(apps/api/src/infrastructure/database/migrations/1730000000000-initial-schema.ts)과 같은 DDL 이다.

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
);
CREATE UNIQUE INDEX "uq_accounts_username" ON "accounts" ("username");

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
);
CREATE INDEX "idx_sessions_owner" ON "sessions" ("owner_id");

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
);
CREATE INDEX "idx_turn_analyses_session" ON "turn_analyses" ("session_id");
CREATE INDEX "idx_turn_analyses_risk" ON "turn_analyses" ("risk_level");
CREATE INDEX "idx_turn_analyses_to_task" ON "turn_analyses" ("to_task");
