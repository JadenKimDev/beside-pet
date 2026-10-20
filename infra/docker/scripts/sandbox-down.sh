#!/usr/bin/env bash
# sandbox 의 db 를 멈춘다. `pnpm sandbox:down` 이 부른다.
#
#   infra/docker/scripts/sandbox-down.sh
#
# 멈추기만 한다(stop). 볼륨(beside-sandbox_dbdata)은 남는다. 내용을 새로 하려면 `pnpm sandbox:reset`.

set -euo pipefail

source "$(dirname "$0")/lib.sh"

sandbox_compose stop db
