#!/usr/bin/env bash
# 로컬 개발용 Postgres 를 다룬다. apps/api/docker-compose.yml 의 `db` 서비스를 그대로 쓴다.
#
#   dev-tools/scripts/db.sh up      # 띄우고 healthcheck 가 통과할 때까지 기다린다
#   dev-tools/scripts/db.sh down    # 멈춘다(볼륨은 남긴다)
#   dev-tools/scripts/db.sh status  # 상태
#
# 포트는 루프백(127.0.0.1)에만 연다. 호스트 포트는 DB_PORT(기본 5432, apps/api 의 .env.example 과 같다)이고,
# 다른 프로젝트의 Postgres 가 5432 를 쓰고 있으면 `DB_PORT=5433 pnpm db:up` 처럼 바꾸고 DATABASE_URL 도 맞춘다.
# compose 파일의 `ports` 를 덮어쓰는 설정을 표준 입력으로 더 얹는다
# (apps/api 의 파일은 고치지 않는다). 프로젝트 이름은 워크트리마다 같게 고정해 같은 DB 를 함께 쓴다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/apps/api/docker-compose.yml"
PROJECT=beside-pet
DB_PORT="${DB_PORT:-5432}"

OVERRIDE="services:
  db:
    ports: !override
      - \"127.0.0.1:${DB_PORT}:5432\"
"

compose() {
  # compose 는 파일 전체를 보간한다. `api`(profile full, 여기서는 띄우지 않는다)가 요구하는 키를 자리표시로만 채운다.
  printf '%s' "$OVERRIDE" | ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-unused-by-db}" docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f - "$@"
}

case "${1:-}" in
  up)
    compose up -d --wait db
    ;;
  down)
    compose stop db
    ;;
  status)
    compose ps db
    ;;
  *)
    echo "쓰는 법: $0 up|down|status" >&2
    exit 2
    ;;
esac
