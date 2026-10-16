-- 전사를 행으로 둔다(#10): 메시지 하나가 messages 행 하나다. seq 는 전사 안의 자리(0 부터)다.
-- 지원 계획(plan)과 종료 요약(summary)은 프로필과 전사·분석에서 규칙으로 다시 구하므로 저장하지 않는다.
-- sessions 의 history, plan, summary 칸을 지운다. 지울 때 실제 데이터는 없었다.

CREATE TABLE "messages" (
  "session_id" varchar NOT NULL REFERENCES "sessions" ("id"),
  "seq" integer NOT NULL,
  "role" varchar NOT NULL,
  "text" text NOT NULL,
  "task" integer NOT NULL,
  "at" timestamptz NOT NULL,
  PRIMARY KEY ("session_id", "seq")
);
CREATE INDEX "idx_messages_session" ON "messages" ("session_id");

ALTER TABLE "sessions"
  DROP COLUMN "history",
  DROP COLUMN "plan",
  DROP COLUMN "summary";
