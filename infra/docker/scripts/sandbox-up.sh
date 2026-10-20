#!/usr/bin/env bash
# sandbox 의 db 만 Docker 에 띄운다(127.0.0.1:5433). `pnpm sandbox:up` 이 부른다. 서버와 웹은 `pnpm dev` 로 띄운다.
#
#   infra/docker/scripts/sandbox-up.sh
#   SANDBOX_DB_PORT=5435 infra/docker/scripts/sandbox-up.sh   # 포트를 바꿀 때(DATABASE_URL 도 맞춘다)
#
# - healthcheck 가 통과할 때까지 기다린다(--wait).
# - 포트를 다른 컨테이너(예: 옛 개발 DB beside-pet-db-1)가 쓰고 있으면 그 이름과 내리는 법을 알리고 멈춘다.
#   대신 내리지 않는다.

set -euo pipefail

source "$(dirname "$0")/lib.sh"

holders="$(docker ps --filter "publish=$SANDBOX_DB_PORT" --format '{{.Names}}' | grep -v "^${SANDBOX_PROJECT}-db-" || true)"
if [ -n "$holders" ]; then
  {
    echo "포트 $SANDBOX_DB_PORT 를 다른 컨테이너가 쓰고 있다: $holders"
    for name in $holders; do
      echo "  docker stop $name   # 멈추기만 한다. 볼륨은 남는다"
    done
    echo "내린 뒤 다시 돌린다. 이 스크립트는 대신 내리지 않는다."
  } >&2
  exit 1
fi

if ! sandbox_compose up -d --wait db; then
  {
    echo "sandbox db 를 띄우지 못했다. 포트 $SANDBOX_DB_PORT 를 누가 듣고 있는지 본다:"
    echo "  lsof -nP -iTCP:$SANDBOX_DB_PORT -sTCP:LISTEN"
  } >&2
  exit 1
fi

echo "sandbox db 가 떴다: 127.0.0.1:$SANDBOX_DB_PORT"
