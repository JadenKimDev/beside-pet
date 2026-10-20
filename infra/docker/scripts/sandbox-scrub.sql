-- sandbox 에 복원한 production 복사본에서 사용자가 쓴 본문을 자리 표시자로 바꾸고, 남은 본문의 수를 센다.
-- infra/docker/scripts/sandbox-reset.sh 가 sandbox db 에 한 트랜잭션으로 돌린다(psql -1 -v ON_ERROR_STOP=1 -f -).
-- 마지막 줄의 출력은 `<자리 표시자가 아닌 messages.text 수>|<자리 표시자가 아닌 JSONB 문자열 값 수>` 뿐이다.
-- 본문은 출력하지 않는다(루트 CLAUDE.md "읽지 않는 것").
--
-- 바꾸는 칸(지금 스키마). 본문 칸을 더하는 마이그레이션은 이 표와 아래 UPDATE, 검사에 그 칸을 더한다(ADR-0021).
--
-- | 칸                         | 바꾸는 법                                  | 그대로 두는 키(코드 값)                                            |
-- |----------------------------|--------------------------------------------|--------------------------------------------------------------------|
-- | messages.text              | '[sandbox] ' || role || ' ' || seq          | -                                                                  |
-- | sessions.grief_profile     | JSONB 의 문자열 값을 '[sandbox]' 로         | griefPath, togetherRange, lossType, situation, preferredLanguage,  |
-- |                            | (키와 구조, 숫자, 불리언은 둔다)            | sleep, eating (dailyState 아래)                                    |
-- | sessions.report            | 같음                                        | at, locale, key (sections[].key)                                   |
-- | turn_analyses.supervision  | 같음                                        | quality, flags (배열의 값까지)                                     |
--
-- 그대로 두는 칸: 행 수, 시각, 상태, 과제·단계·집계 칸(turn_analyses.risk_level 등),
-- turn_analyses.knowledge(source, tags 뿐), accounts 전부(username, password_hash 는 sandbox 에서 같은 계정으로
-- 로그인하려고 둔다. 이메일 칸은 없다).
--
-- 테이블이 없으면(마이그레이션이 적용되지 않은 production) UPDATE 가 실패한다. sandbox-reset.sh 가 먼저 테이블을 보고 알린다.

-- 문자열 값을 '[sandbox]' 로 바꾼다. skip_keys 의 키 아래는 통째로 둔다.
CREATE FUNCTION pg_temp.sandbox_scrub_jsonb(doc jsonb, skip_keys text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result jsonb;
  k text;
  v jsonb;
BEGIN
  CASE jsonb_typeof(doc)
    WHEN 'string' THEN
      RETURN to_jsonb('[sandbox]'::text);
    WHEN 'object' THEN
      result := '{}'::jsonb;
      FOR k, v IN SELECT e.key, e.value FROM jsonb_each(doc) AS e LOOP
        IF k = ANY (skip_keys) THEN
          result := result || jsonb_build_object(k, v);
        ELSE
          result := result || jsonb_build_object(k, pg_temp.sandbox_scrub_jsonb(v, skip_keys));
        END IF;
      END LOOP;
      RETURN result;
    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(pg_temp.sandbox_scrub_jsonb(e.value, skip_keys) ORDER BY e.ord), '[]'::jsonb)
        INTO result
        FROM jsonb_array_elements(doc) WITH ORDINALITY AS e(value, ord);
      RETURN result;
    ELSE
      RETURN doc;
  END CASE;
END
$$;

-- skip_keys 밖에서 '[sandbox]' 가 아닌 문자열 값의 수. 바꾸는 함수와 따로 세어 바꾸기의 빠짐을 잡는다.
CREATE FUNCTION pg_temp.sandbox_unscrubbed_strings(doc jsonb, skip_keys text[]) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n bigint := 0;
  k text;
  v jsonb;
BEGIN
  CASE jsonb_typeof(doc)
    WHEN 'string' THEN
      RETURN CASE WHEN doc = to_jsonb('[sandbox]'::text) THEN 0 ELSE 1 END;
    WHEN 'object' THEN
      FOR k, v IN SELECT e.key, e.value FROM jsonb_each(doc) AS e LOOP
        IF NOT (k = ANY (skip_keys)) THEN
          n := n + pg_temp.sandbox_unscrubbed_strings(v, skip_keys);
        END IF;
      END LOOP;
      RETURN n;
    WHEN 'array' THEN
      FOR v IN SELECT e.value FROM jsonb_array_elements(doc) AS e LOOP
        n := n + pg_temp.sandbox_unscrubbed_strings(v, skip_keys);
      END LOOP;
      RETURN n;
    ELSE
      RETURN 0;
  END CASE;
END
$$;

-- 칸마다 그대로 두는 키. 바꾸기와 검사가 같은 목록을 쓴다.
CREATE TEMP TABLE sandbox_skip_keys (col text PRIMARY KEY, keys text[] NOT NULL) ON COMMIT DROP;
INSERT INTO sandbox_skip_keys VALUES
  ('grief_profile', ARRAY['griefPath', 'togetherRange', 'lossType', 'situation', 'preferredLanguage', 'sleep', 'eating']),
  ('report', ARRAY['at', 'locale', 'key']),
  ('supervision', ARRAY['quality', 'flags']);

-- --- 바꾸기 ---
UPDATE messages SET text = '[sandbox] ' || role || ' ' || seq;

UPDATE sessions SET
  grief_profile = pg_temp.sandbox_scrub_jsonb(grief_profile, (SELECT keys FROM sandbox_skip_keys WHERE col = 'grief_profile')),
  report = pg_temp.sandbox_scrub_jsonb(report, (SELECT keys FROM sandbox_skip_keys WHERE col = 'report'));

UPDATE turn_analyses SET
  supervision = pg_temp.sandbox_scrub_jsonb(supervision, (SELECT keys FROM sandbox_skip_keys WHERE col = 'supervision'))
WHERE supervision IS NOT NULL;

-- --- 남은 본문 검사(수만) ---
\pset tuples_only on
\pset format unaligned
SELECT
  (SELECT count(*) FROM messages WHERE left(text, 9) <> '[sandbox]')
  || '|' ||
  (
    (SELECT coalesce(sum(
        pg_temp.sandbox_unscrubbed_strings(grief_profile, (SELECT keys FROM sandbox_skip_keys WHERE col = 'grief_profile'))
      + coalesce(pg_temp.sandbox_unscrubbed_strings(report, (SELECT keys FROM sandbox_skip_keys WHERE col = 'report')), 0)
     ), 0) FROM sessions)
    +
    (SELECT coalesce(sum(
        pg_temp.sandbox_unscrubbed_strings(supervision, (SELECT keys FROM sandbox_skip_keys WHERE col = 'supervision'))
     ), 0) FROM turn_analyses)
  );

DROP FUNCTION pg_temp.sandbox_scrub_jsonb(jsonb, text[]);
DROP FUNCTION pg_temp.sandbox_unscrubbed_strings(jsonb, text[]);
