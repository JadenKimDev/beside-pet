-- 소프트 삭제(#42): 지운 대화와 리포트, 정지한 계정의 "언제 지웠나"만 사실로 적는다.
-- 셋 다 NULL 이 "살아 있음"이고 기본값이 없어 기존 행의 뜻은 바뀌지 않는다. 보관 만료는 저장하지 않고
-- 쿼리에서 이 시각으로 계산한다(루트 CLAUDE.md "데이터를 두는 원칙").
ALTER TABLE "sessions" ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "sessions" ADD COLUMN "report_deleted_at" timestamptz;
ALTER TABLE "accounts" ADD COLUMN "deleted_at" timestamptz;

-- current_memory 는 출처 세션이 살아 있는 사실만 낸다. 칸과 순서는 20261022130000_memory.sql 의 것 그대로다.
-- memory_notes.session_id 는 NOT NULL 이고 sessions 를 가리키는 FK 라 내부 조인이 행을 더 빼지 않는다.
-- 되살리면(deleted_at 을 비우면) 다시 나오므로 기억 행은 손대지 않는다.
CREATE OR REPLACE VIEW "current_memory" AS
SELECT n."id", n."owner_id", n."session_id", n."seq", n."kind", n."pet_id", n."text", n."extracted_by",
       n."superseded_by", n."said_at", n."created_at"
FROM "memory_notes" n
JOIN "sessions" s ON s."id" = n."session_id"
WHERE n."superseded_by" IS NULL
  AND s."deleted_at" IS NULL
ORDER BY n."pet_id" NULLS LAST, n."said_at" DESC, n."seq" DESC;
