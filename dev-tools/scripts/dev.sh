#!/usr/bin/env bash
# 로컬 개발: Rust 서버(127.0.0.1:3000)와 대화 웹(127.0.0.1:3001)을 함께 포그라운드로 띄운다. `pnpm dev` 가 부른다.
#
#   dev-tools/scripts/dev.sh
#
# - 서버는 `dev-tools/scripts/cargo.sh run -p beside-pet-server`, 웹은 `pnpm --filter ./apps/web dev`(next 가 127.0.0.1 에만 연다).
# - 환경은 APP_ENV(기본 sandbox)이고 서버에 export 한다. 서버는 APP_ENV 를 프로세스 환경에서만 읽는다.
#   서버의 설정 파일은 `.env.${APP_ENV}`(기본 `.env.sandbox`)이고, 레포 루트(띄운 디렉터리)에서 먼저 찾고
#   없으면 apps/server/ 에서 찾는다(apps/server/.env.example 머리 주석). 둘 다 없고 환경에 DATABASE_URL 도 없으면
#   만드는 법을 알리고 멈춘다. 이 스크립트는 .env 파일의 값을 읽거나 출력하지 않는다(있는지만 본다).
# - DB 는 따로 띄운다(`pnpm db:up` 또는 `pnpm sandbox:up`, 127.0.0.1:5433). 여기서는 띄우지 않는다.
# - 3000 이나 3001 을 이미 누가 듣고 있으면 그 프로세스를 알리고 멈춘다. 대신 내리지 않는다.
# - 둘 중 하나가 끝나면(또는 Ctrl-C) 나머지도 내린다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

SERVER_PORT=3000
WEB_PORT=3001
export APP_ENV="${APP_ENV:-sandbox}"

# --- 서버 설정 파일이 있는가(값은 보지 않는다) ---
env_name=".env.${APP_ENV}"
if [ ! -f "$REPO_ROOT/$env_name" ] && [ ! -f "$REPO_ROOT/apps/server/$env_name" ] && [ -z "${DATABASE_URL:-}" ]; then
  {
    echo "서버 설정이 없다: $env_name 가 레포 루트에도 apps/server/ 에도 없고, 환경에 DATABASE_URL 도 없다."
    echo "  cp apps/server/.env.example apps/server/$env_name   # 만든 뒤 DATABASE_URL 과 모델 설정을 채운다"
    echo "  (pnpm db:up 의 sandbox DB 는 127.0.0.1:\${DB_PORT:-5433} 이다. 포트를 바꿨으면 DATABASE_URL 도 맞춘다)"
  } >&2
  exit 1
fi

# --- 포트가 비어 있는가 ---
busy=0
for port in "$SERVER_PORT" "$WEB_PORT"; do
  if holders="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null)" && [ -n "$holders" ]; then
    echo "포트 $port 를 이미 쓰고 있다. 내린 뒤 다시 띄운다:" >&2
    echo "$holders" >&2
    busy=1
  fi
done
if [ "$busy" -ne 0 ]; then
  exit 1
fi

# --- 띄우고 함께 내린다 ---
pids=()

stop_all() {
  trap - INT TERM EXIT
  for pid in ${pids[@]+"${pids[@]}"}; do
    # 각자 따로 된 프로세스 묶음(set -m)의 머리라 묶음째 내린다. cargo 아래의 서버, pnpm 아래의 next 까지 내려간다.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap 'stop_all; exit 130' INT TERM
trap stop_all EXIT

set -m
PORT="$SERVER_PORT" dev-tools/scripts/cargo.sh run -p beside-pet-server &
pids+=("$!")
pnpm --filter ./apps/web dev &
pids+=("$!")
set +m

echo "서버 http://127.0.0.1:$SERVER_PORT (pid ${pids[0]}), 웹 http://127.0.0.1:$WEB_PORT (pid ${pids[1]}). Ctrl-C 로 함께 내린다."

# 하나가 끝나면 그 종료 코드로 나가고, EXIT trap 이 나머지를 내린다.
# macOS 의 /bin/bash(3.2)에는 `wait -n` 이 없어 1초마다 살아 있는지 본다.
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do
  sleep 1
done
for i in 0 1; do
  if ! kill -0 "${pids[$i]}" 2>/dev/null; then
    status=0
    wait "${pids[$i]}" || status=$?
    name=서버
    [ "$i" -eq 1 ] && name=웹
    echo "$name 쪽이 끝났다(종료 코드 $status). 나머지도 내린다." >&2
    exit "$status"
  fi
done
