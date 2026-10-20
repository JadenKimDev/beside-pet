#!/usr/bin/env bash
# production 의 db, api, web 을 멈춘다. `pnpm prod:down` 이 부른다.
#
#   infra/docker/scripts/prod-down.sh
#
# 컨테이너를 멈추기만 한다(stop). 볼륨(beside-production_dbdata)은 남으므로 다시 prod:up 하면 데이터가 그대로다.
# production 의 데이터를 지우는 명령(down -v, volume rm)은 이 스크립트에 두지 않는다.

set -euo pipefail

source "$(dirname "$0")/lib.sh"

prod_compose --profile full stop
