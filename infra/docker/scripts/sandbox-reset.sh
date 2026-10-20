#!/usr/bin/env bash
# production DB 를 sandbox DB 에 새로 복원하고, 사용자가 쓴 본문을 자리 표시자로 바꾼다. `pnpm sandbox:reset` 이 부른다.
#
#   infra/docker/scripts/sandbox-reset.sh
#
# 순서:
#   1. 127.0.0.1:3000 에 서버가 떠 있으면 내리라고 알리고 멈춘다(복원이 sandbox DB 의 연결을 끊는다).
#   2. production db 가 떠 있는지 본다(없으면 `pnpm prod:up` 을 알리고 멈춘다). sandbox db 가 없으면 띄운다.
#   3. sandbox 의 public 스키마를 비우고, production 의 pg_dump 를 sandbox 의 psql 로 바로 파이프한다.
#      덤프 파일을 디스크에 만들지 않는다. production 에는 pg_dump(읽기)만 보낸다.
#   4. sandbox-scrub.sql 로 본문을 '[sandbox]' 자리 표시자로 바꾸고, 남은 본문의 수를 센다.
#   5. 남은 본문이 0 이 아니거나 3 이후 어디서든 실패하면 sandbox 의 테이블을 모두 TRUNCATE 하고 실패로 끝낸다.
#   6. 행 수(accounts, sessions, messages, turn_analyses)만 출력한다. 본문은 출력하지 않는다.
#      sandbox 쪽 psql 의 오류는 SQLSTATE 만 낸다(VERBOSITY=sqlstate). 오류 문구에 행의 값이 실릴 수 있어서다.
#
# 이전 sandbox 데이터는 버린다. 포트는 lib.sh 의 변수(PROD_DB_PORT, SANDBOX_DB_PORT)로 바꾼다.

set -euo pipefail

source "$(dirname "$0")/lib.sh"

SERVER_PORT=3000

# 오류 문구에 행의 값이 실릴 수 있어(COPY 의 CONTEXT 등) SQLSTATE 만 내게 한다.
sandbox_psql() {
  sandbox_compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -q "$@"
}

# --- 1. 서버가 sandbox DB 를 쓰고 있지 않은가 ---
if holders="$(lsof -nP -iTCP:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null)" && [ -n "$holders" ]; then
  echo "포트 $SERVER_PORT 에 서버가 떠 있다. 복원이 연결을 끊으므로 먼저 내린 뒤 다시 돌린다:" >&2
  echo "$holders" >&2
  exit 1
fi

# --- 2. 두 db 가 떠 있는가 ---
if ! is_running prod_compose db; then
  echo "production db 가 떠 있지 않다. 먼저 띄운다: pnpm prod:up" >&2
  exit 1
fi
if ! is_running sandbox_compose db; then
  "$SCRIPTS_DIR/sandbox-up.sh"
fi

# 3 부터는 실패하면 복사본을 남기지 않는다.
wipe_sandbox() {
  echo "sandbox DB 를 비운다(본문이 남은 복사본을 두지 않는다)." >&2
  if ! sandbox_psql -c "DO \$\$ DECLARE t text; BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t
        FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_sqlx_migrations';
      IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' CASCADE'; END IF;
    END \$\$;"; then
    # TRUNCATE 가 안 되면 스키마째 지운다.
    sandbox_psql -c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" || {
      echo "sandbox DB 를 비우지 못했다. 직접 확인한다: docker compose -p $SANDBOX_PROJECT ..." >&2
    }
  fi
}
copied=0
done_ok=0
on_exit() {
  if [ "$copied" -eq 1 ] && [ "$done_ok" -eq 0 ]; then
    wipe_sandbox
  fi
}
trap on_exit EXIT

# --- 3. 비우고 복원 ---
echo "sandbox DB 를 비우고 production 을 복원한다." >&2
copied=1
sandbox_psql -c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
prod_compose exec -T db pg_dump -U "$DB_USER" --clean --if-exists "$DB_NAME" \
  | sandbox_psql >/dev/null

# --- 4. 본문 바꾸기 ---
missing="$(sandbox_psql -At -c "SELECT string_agg(t, ', ') FROM unnest(ARRAY['accounts', 'sessions', 'messages', 'turn_analyses']) AS t WHERE to_regclass('public.' || t) IS NULL")"
if [ -n "$missing" ]; then
  {
    echo "복원한 DB 에 테이블이 없다: $missing"
    echo "production DB 에 마이그레이션이 적용되지 않았다. pnpm prod:up 으로 서버를 한 번 띄운 뒤 다시 돌린다."
  } >&2
  exit 1
fi

echo "본문을 자리 표시자로 바꾼다." >&2
counts="$(sandbox_psql -1 -f - <"$SCRIPTS_DIR/sandbox-scrub.sql" | tail -n 1)"

# --- 5. 남은 본문 검사 ---
messages_left="${counts%%|*}"
strings_left="${counts##*|}"
if ! [[ "$messages_left" =~ ^[0-9]+$ && "$strings_left" =~ ^[0-9]+$ ]]; then
  echo "남은 본문 검사의 출력을 읽지 못했다." >&2
  exit 1
fi
if [ "$messages_left" -ne 0 ] || [ "$strings_left" -ne 0 ]; then
  echo "본문이 남았다: messages.text $messages_left 개, JSONB 문자열 값 $strings_left 개." >&2
  exit 1
fi
done_ok=1

# --- 6. 행 수 ---
echo "sandbox 를 production 에서 다시 만들었다(127.0.0.1:$SANDBOX_DB_PORT). 행 수:"
sandbox_psql -c "SELECT
  (SELECT count(*) FROM accounts) AS accounts,
  (SELECT count(*) FROM sessions) AS sessions,
  (SELECT count(*) FROM messages) AS messages,
  (SELECT count(*) FROM turn_analyses) AS turn_analyses"
