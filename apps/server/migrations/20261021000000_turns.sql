-- 턴을 사실로 둔다(#19): 사용자 턴은 받자마자 pending 으로 적고, 답이 끝나면 done, 실패하면 failed 와 그 종류를 적는다.
-- 본문은 messages.text 뿐이고 여기 두지 않는다. 첫 인사도 턴 하나다(사용자 메시지 없음). id 는 클라이언트가 만든 UUID(멱등 키)다.

CREATE TABLE "turns" (
  "id" varchar PRIMARY KEY,
  "session_id" varchar NOT NULL REFERENCES "sessions" ("id"),
  "status" varchar NOT NULL CHECK ("status" IN ('pending', 'done', 'failed')),
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  "error_kind" varchar CHECK ("error_kind" IN ('timeout', 'provider', 'restart')),
  CHECK (("status" = 'pending') = ("finished_at" IS NULL)),
  CHECK (("status" = 'failed') = ("error_kind" IS NOT NULL))
);
CREATE INDEX "idx_turns_session" ON "turns" ("session_id");

-- 메시지가 속한 턴. #19 전의 행은 비운다.
ALTER TABLE "messages" ADD COLUMN "turn_id" varchar REFERENCES "turns" ("id");
