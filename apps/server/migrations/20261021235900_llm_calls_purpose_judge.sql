-- 답의 상투성 판정(ADR-0031)도 모델 호출이라 llm_calls 에 사실로 남는다. purpose 에 'judge' 를 더한다.
-- 기존 행의 뜻은 바뀌지 않는다(허용 값을 넓히기만 한다).
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_purpose_check";
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_purpose_check"
  CHECK ("purpose" IN ('reply', 'crisis', 'report', 'judge'));
