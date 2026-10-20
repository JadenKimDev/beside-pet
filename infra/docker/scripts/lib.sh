#!/usr/bin/env bash
# infra/docker/scripts/ 의 스크립트가 source 하는 공통 값과 compose 호출. 혼자 돌리지 않는다.
#
#   source "$(dirname "$0")/lib.sh"
#   prod_compose ps db        # docker compose -f infra/docker/compose.yaml -p beside-production ...
#   sandbox_compose ps db     # docker compose -f infra/docker/compose.yaml -p beside-sandbox ...
#
# 포트는 환경 변수로 덮어쓴다. compose 가 읽는 DB_PORT 는 환경마다 여기서 골라 넘긴다
# (한 스크립트가 두 환경을 함께 부르므로 DB_PORT 하나로는 가를 수 없다).
#   PROD_DB_PORT    (기본 5434)  production db
#   API_PORT        (기본 8000)  production api
#   WEB_PORT        (기본 8001)  production web
#   SANDBOX_DB_PORT (기본 5433)  sandbox db
# 호스트 포트는 compose 가 루프백(127.0.0.1)에만 연다.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/compose.yaml"
SCRIPTS_DIR="$REPO_ROOT/infra/docker/scripts"

PROD_PROJECT=beside-production
SANDBOX_PROJECT=beside-sandbox

PROD_DB_PORT="${PROD_DB_PORT:-5434}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-8001}"
SANDBOX_DB_PORT="${SANDBOX_DB_PORT:-5433}"

# DB 이름과 사용자는 compose.yaml 의 db 서비스와 같다.
DB_USER=beside
DB_NAME=besidepet

prod_compose() {
  DB_PORT="$PROD_DB_PORT" API_PORT="$API_PORT" WEB_PORT="$WEB_PORT" \
    docker compose -f "$COMPOSE_FILE" -p "$PROD_PROJECT" "$@"
}

sandbox_compose() {
  DB_PORT="$SANDBOX_DB_PORT" docker compose -f "$COMPOSE_FILE" -p "$SANDBOX_PROJECT" "$@"
}

# 서비스가 떠 있으면 0. 예: is_running prod_compose db
is_running() {
  local ids
  ids="$("$1" ps --status running -q "$2" 2>/dev/null)" || return 1
  [ -n "$ids" ]
}
