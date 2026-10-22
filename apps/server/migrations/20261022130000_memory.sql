-- 장기기억(#38): 사용자가 말한 사실을 계정 단위의 행으로 둔다. 행 하나는 "추출이 일어났다"는 사실이고,
-- 지금 유효한 목록은 뷰 current_memory 로 구한다(루트 CLAUDE.md "데이터를 두는 원칙").
-- 더하기만 한다. grief_profile 과 기존 칸의 뜻은 바뀌지 않는다.
-- owner_id 는 sessions.owner_id 와 같은 타입이고 그처럼 accounts 를 가리키는 FK 를 두지 않는다.
-- 세션을 지우면 그 세션에서 나온 아이, 사실, 옵트아웃이 함께 지워진다(ADR-0006). 다른 세션의 사실이
-- 지워진 아이나 정정을 가리키면 그 칸만 비운다(세션 삭제가 막히지 않게).

-- 아이. 종(species)은 프로필에 없어 칸을 두지 않는다. 사용자가 말하면 memory_notes 의 'pet' 사실이 된다.
CREATE TABLE "pets" (
  "id" varchar PRIMARY KEY,
  "owner_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "status" varchar NOT NULL CHECK ("status" IN ('deceased', 'living')),
  "loss_type" varchar,
  "source_session_id" varchar NOT NULL REFERENCES "sessions" ("id") ON DELETE CASCADE,
  "said_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_pets_owner" ON "pets" ("owner_id");
CREATE INDEX "idx_pets_source_session" ON "pets" ("source_session_id");

-- 사용자가 말한 사실 한 문장. seq 는 출처인 사용자 메시지의 자리다. 건강·직업 종류는 없다.
-- 정정은 새 행이고 옛 행의 superseded_by 가 새 행을 가리킨다. 옛 행은 남는다.
CREATE TABLE "memory_notes" (
  "id" varchar PRIMARY KEY,
  "owner_id" varchar NOT NULL,
  "session_id" varchar NOT NULL REFERENCES "sessions" ("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "kind" varchar NOT NULL
    CHECK ("kind" IN ('pet', 'person', 'object', 'place', 'date', 'ritual', 'preference')),
  "pet_id" varchar REFERENCES "pets" ("id") ON DELETE SET NULL,
  "text" text NOT NULL,
  "extracted_by" varchar NOT NULL,
  "superseded_by" varchar REFERENCES "memory_notes" ("id") ON DELETE SET NULL,
  "said_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_memory_notes_owner" ON "memory_notes" ("owner_id");
CREATE INDEX "idx_memory_notes_session" ON "memory_notes" ("session_id");
CREATE INDEX "idx_memory_notes_pet" ON "memory_notes" ("pet_id");
CREATE INDEX "idx_memory_notes_superseded_by" ON "memory_notes" ("superseded_by");

-- "기억하지 마": 내용 없이 사건만. 발화 하나에 한 행.
CREATE TABLE "memory_optouts" (
  "owner_id" varchar NOT NULL,
  "session_id" varchar NOT NULL REFERENCES "sessions" ("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "at" timestamptz NOT NULL,
  PRIMARY KEY ("session_id", "seq")
);
CREATE INDEX "idx_memory_optouts_owner" ON "memory_optouts" ("owner_id");

-- 지금 유효한 사실: 무효화되지 않은 행을 아이별로(아이 없는 사실은 끝에), 최근 말한 순으로.
CREATE VIEW "current_memory" AS
SELECT "id", "owner_id", "session_id", "seq", "kind", "pet_id", "text", "extracted_by",
       "superseded_by", "said_at", "created_at"
FROM "memory_notes"
WHERE "superseded_by" IS NULL
ORDER BY "pet_id" NULLS LAST, "said_at" DESC, "seq" DESC;

-- 기억 추출도 모델 호출이라 llm_calls 에 사실로 남는다. purpose 에 'memory_extract' 를 더한다.
-- 기존 행의 뜻은 바뀌지 않는다(허용 값을 넓히기만 한다).
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_purpose_check";
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_purpose_check"
  CHECK ("purpose" IN ('reply', 'crisis', 'report', 'judge', 'memory_extract'));
