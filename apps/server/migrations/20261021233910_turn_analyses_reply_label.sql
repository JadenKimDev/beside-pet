-- 답의 상투성 판정은 생성 뒤에 잰 사실이라 그 턴의 분석 행에 그대로 적는다: 라벨, 판정기가 준 그 라벨의 확률, 판정기(ADR-0031).
-- 판정이 없던 기존 행과 판정기를 끈 턴은 NULL 이고, 비율 같은 집계는 저장하지 않고 뷰로 센다.
ALTER TABLE "turn_analyses"
  ADD COLUMN "reply_label" varchar
    CHECK ("reply_label" IN ('generic_comfort', 'specific_reflection', 'question')),
  ADD COLUMN "reply_label_probability" real
    CHECK ("reply_label_probability" BETWEEN 0 AND 1),
  ADD COLUMN "reply_judge" varchar;

-- UTC 날짜(conversations_daily 와 같은 기준)와 라벨별 판정 수. 라벨이 NULL 인 행(판정 없음)은 세지 않는다.
CREATE VIEW "daily_reply_labels" AS
SELECT
  ("at" AT TIME ZONE 'UTC')::date AS "date",
  "reply_label",
  count(*) AS "count"
FROM "turn_analyses"
WHERE "reply_label" IS NOT NULL
GROUP BY 1, 2;
