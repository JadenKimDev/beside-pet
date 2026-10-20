-- 모델 호출을 본문 없이 사실로만 적는다(#4). 프롬프트와 응답 본문 칸은 두지 않는다(루트 CLAUDE.md "읽지 않는 것").
-- 비용, 날짜별 집계는 저장하지 않고 뷰로 구한다(데이터를 두는 원칙). p50·p95 는 기간이 필요해 쿼리가 구한다.

-- 호출 하나가 행 하나다. at 은 끝난 시각이다. 실패면 output_tokens 가 비고, 공급자가 사용량을 주지 않으면 둘 다 빈다.
-- first_token_ms 는 스트리밍 호출만 있다. error_kind 는 오류의 종류(예: provider, unavailable, cancelled)만 적는다.
CREATE TABLE "llm_calls" (
  "id" varchar PRIMARY KEY,
  "at" timestamptz NOT NULL,
  "provider" varchar NOT NULL,
  "model" varchar NOT NULL,
  "purpose" varchar NOT NULL CHECK ("purpose" IN ('reply', 'crisis', 'report')),
  "prompt_version" varchar NOT NULL,
  "session_id" varchar,
  "input_tokens" integer,
  "output_tokens" integer,
  "duration_ms" integer NOT NULL,
  "first_token_ms" integer,
  "outcome" varchar NOT NULL CHECK ("outcome" IN ('ok', 'error')),
  "error_kind" varchar
);
CREATE INDEX "idx_llm_calls_at" ON "llm_calls" ("at");
CREATE INDEX "idx_llm_calls_model_purpose" ON "llm_calls" ("model", "purpose");

-- 모델 단가(USD / 백만 토큰). 단가는 이 테이블 한 곳에만 둔다. 값이 바뀌면 새 effective_from 의 행을 더하고 옛 행은 남긴다.
-- 단가는 공급자와 모델로 찾는다. 같은 모델 이름이 다른 공급자(예: Ollama)로 불려도 그 공급자의 단가가 없으면 비용은 0 이다.
CREATE TABLE "model_prices" (
  "provider" varchar NOT NULL,
  "model" varchar NOT NULL,
  "input_usd_per_mtok" numeric NOT NULL,
  "output_usd_per_mtok" numeric NOT NULL,
  "effective_from" date NOT NULL,
  PRIMARY KEY ("provider", "model", "effective_from")
);
-- 출처: platform.claude.com/docs/en/about-claude/pricing (프롬프트 길이로 갈리는 모델은 10만 토큰 이하의 값). 옛 llm/pricing.rs 의 값이다.
INSERT INTO "model_prices" ("provider", "model", "input_usd_per_mtok", "output_usd_per_mtok", "effective_from") VALUES
  ('anthropic', 'claude-haiku-5-5', 0.10, 0.50, '2026-10-16'),
  ('anthropic', 'claude-haiku-4-5', 1.00, 5.00, '2026-10-16'),
  ('anthropic', 'claude-sonnet-5', 3.00, 15.00, '2026-10-16'),
  ('anthropic', 'claude-opus-4-8', 5.00, 25.00, '2026-10-16');

-- 호출마다의 비용: 같은 공급자·모델의, 호출 시각(UTC 날짜)에 유효한 가장 최근 단가 × 토큰 / 1,000,000. 단가가 없으면 0, 빈 토큰은 0 으로 센다.
CREATE VIEW "llm_call_costs" AS
SELECT
  c.*,
  COALESCE(
    (COALESCE(c."input_tokens", 0) * p."input_usd_per_mtok"
      + COALESCE(c."output_tokens", 0) * p."output_usd_per_mtok") / 1000000,
    0
  )::numeric AS "cost_usd"
FROM "llm_calls" c
LEFT JOIN LATERAL (
  SELECT mp."input_usd_per_mtok", mp."output_usd_per_mtok"
  FROM "model_prices" mp
  WHERE mp."provider" = c."provider"
    AND mp."model" = c."model"
    AND mp."effective_from" <= (c."at" AT TIME ZONE 'UTC')::date
  ORDER BY mp."effective_from" DESC
  LIMIT 1
) p ON true;

-- UTC 날짜, 공급자, 모델별 호출 수, 실패 수, 토큰과 비용의 합.
CREATE VIEW "llm_calls_daily" AS
SELECT
  ("at" AT TIME ZONE 'UTC')::date AS "date",
  "provider",
  "model",
  count(*) AS "calls",
  count(*) FILTER (WHERE "outcome" = 'error') AS "errors",
  COALESCE(sum("input_tokens"), 0)::bigint AS "input_tokens",
  COALESCE(sum("output_tokens"), 0)::bigint AS "output_tokens",
  sum("cost_usd") AS "cost_usd"
FROM "llm_call_costs"
GROUP BY 1, 2, 3;

-- UTC 날짜별 대화: 그날 시작한 sessions, 그날의 사용자 messages, 그날의 위기 턴(turn_analyses).
-- 날짜 축은 세 집계의 합집합이고 없는 쪽은 0 이다.
-- 위기 턴은 risk_level 이 주의(2) 이상인 행을 risk_detected_by 로 나눠 센다. 2026-10-20 기준 support 가 쓰는 값은
-- 'keyword'(주의 이상) 와 'none' 뿐이고(support/store/codec.rs detector_text, support/rules/turn_analysis.rs
-- RiskAssessment::of), 모델이 잡은 위기도 'keyword' 로 적힌다. 'model' 을 쓰는 코드는 아직 없어 crisis_model 은 지금 0 이다.
CREATE VIEW "conversations_daily" AS
WITH
  s AS (
    SELECT ("created_at" AT TIME ZONE 'UTC')::date AS "date", count(*) AS "sessions"
    FROM "sessions" GROUP BY 1
  ),
  t AS (
    SELECT ("at" AT TIME ZONE 'UTC')::date AS "date", count(*) AS "turns"
    FROM "messages" WHERE "role" = 'user' GROUP BY 1
  ),
  k AS (
    SELECT
      ("at" AT TIME ZONE 'UTC')::date AS "date",
      count(*) FILTER (WHERE "risk_detected_by" = 'keyword') AS "crisis_keyword",
      count(*) FILTER (WHERE "risk_detected_by" = 'model') AS "crisis_model"
    FROM "turn_analyses" WHERE "risk_level" >= 2 GROUP BY 1
  ),
  d AS (
    SELECT "date" FROM s UNION SELECT "date" FROM t UNION SELECT "date" FROM k
  )
SELECT
  d."date",
  COALESCE(s."sessions", 0) AS "sessions",
  COALESCE(t."turns", 0) AS "turns",
  COALESCE(k."crisis_keyword", 0) AS "crisis_keyword",
  COALESCE(k."crisis_model", 0) AS "crisis_model"
FROM d
LEFT JOIN s ON s."date" = d."date"
LEFT JOIN t ON t."date" = d."date"
LEFT JOIN k ON k."date" = d."date";
