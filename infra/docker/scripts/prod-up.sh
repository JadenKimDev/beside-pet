#!/usr/bin/env bash
# production 의 db, api, web 을 Docker 에 띄운다(compose 프로필 full). `pnpm prod:up` 이 부른다.
#
#   infra/docker/scripts/prod-up.sh
#   PROD_DB_PORT=5434 API_PORT=8000 WEB_PORT=8001 infra/docker/scripts/prod-up.sh   # 포트를 바꿀 때
#
# - 서버의 비밀과 모델 설정은 apps/server/.env.production(gitignore)에서 받는다. 없으면 만드는 법을 알리고 멈춘다.
#   이 스크립트는 그 파일의 값을 읽거나 출력하지 않는다(있는지만 본다).
# - 이미지를 다시 빌드하고(--build), healthcheck 가 통과할 때까지 기다린다(--wait).
# - 데이터는 production 볼륨(beside-production_dbdata)에 남는다.

set -euo pipefail

source "$(dirname "$0")/lib.sh"

env_file="$REPO_ROOT/apps/server/.env.production"
if [ ! -f "$env_file" ]; then
  {
    echo "production 서버 설정이 없다: apps/server/.env.production"
    echo "  cp apps/server/.env.example apps/server/.env.production   # 만든 뒤 JWT_SECRET 과 모델 설정(LLM_PROVIDER, LLM_MODEL 등)을 채운다"
    echo "  (DATABASE_URL, PORT, APP_ENV, COOKIE_SECURE, OLLAMA_BASE_URL 은 compose 가 정하므로 채우지 않아도 된다)"
  } >&2
  exit 1
fi

prod_compose --profile full up -d --build --wait

echo "production 이 떴다: 웹 http://127.0.0.1:$WEB_PORT , 서버 http://127.0.0.1:$API_PORT (DB 127.0.0.1:$PROD_DB_PORT)"
