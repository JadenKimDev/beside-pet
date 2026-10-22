-- 턴 추적: 그 턴의 발화 프롬프트에 들어간 블록과 화법 결정을 분석 행에 그대로 적는다(PRD #37).
-- sandbox(APP_ENV=sandbox)에서만 채우고 production 은 늘 NULL 이다. 기존 행도 NULL 이고 기본값은 두지 않는다.
ALTER TABLE "turn_analyses"
  ADD COLUMN "trace" jsonb;
