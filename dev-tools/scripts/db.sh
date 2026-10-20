#!/usr/bin/env bash
# sandbox DB(개발, 테스트, 실측용 Postgres)를 다룬다. `pnpm db:up` 등이 부르는 sandbox db 의 별칭이다.
# infra/docker/compose.yaml 의 `db` 서비스를 프로젝트 이름 beside-sandbox 로 부른다(infra/docker/README.md).
#
#   dev-tools/scripts/db.sh up      # 띄우고 healthcheck 가 통과할 때까지 기다린다(= pnpm sandbox:up)
#   dev-tools/scripts/db.sh down    # 멈춘다(볼륨은 남긴다. = pnpm sandbox:down)
#   dev-tools/scripts/db.sh status  # 상태
#
# 포트는 루프백(127.0.0.1)에만 연다. 호스트 포트는 DB_PORT(기본 5433)이고, 바꾸면 DATABASE_URL 도 맞춘다.
# 프로젝트 이름이 고정이라 워크트리마다 같은 sandbox DB 를 함께 쓴다.
# 내용을 production 에서 새로 가져오려면 `pnpm sandbox:reset`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export SANDBOX_DB_PORT="${DB_PORT:-5433}"
source "$REPO_ROOT/infra/docker/scripts/lib.sh"

case "${1:-}" in
  up)
    "$SCRIPTS_DIR/sandbox-up.sh"
    ;;
  down)
    "$SCRIPTS_DIR/sandbox-down.sh"
    ;;
  status)
    sandbox_compose ps db
    ;;
  *)
    echo "쓰는 법: $0 up|down|status" >&2
    exit 2
    ;;
esac
