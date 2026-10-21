-- 턴의 상태에 streaming(답이 흐르는 중)과 cancelled(사용자가 중단)를 더한다(#20, ADR-0030).
-- 끝 시각은 pending·streaming 일 때만 비고, 중단한 턴은 끝 시각이 있고 오류 종류가 없다. 있는 행의 뜻은 바뀌지 않는다.

ALTER TABLE "turns" DROP CONSTRAINT "turns_status_check";
ALTER TABLE "turns" ADD CONSTRAINT "turns_status_check"
  CHECK ("status" IN ('pending', 'streaming', 'done', 'failed', 'cancelled'));

ALTER TABLE "turns" DROP CONSTRAINT "turns_check";
ALTER TABLE "turns" ADD CONSTRAINT "turns_finished_at_check"
  CHECK (("status" IN ('pending', 'streaming')) = ("finished_at" IS NULL));
