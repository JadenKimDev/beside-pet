#!/usr/bin/env bash
# production(AWS EC2)에 지금 커밋을 배포한다. `pnpm deploy:prod` 가 부른다.
#
#   pnpm deploy:prod
#   POLL_SECONDS=10 pnpm deploy:prod   # SSM 결과를 보는 간격을 바꿀 때
#   MAX_WAIT_SECONDS=3600 pnpm deploy:prod   # 호스트 배포를 기다리는 최대 시간(기본 1800초)을 바꿀 때
#
# 전제
# - pulumi 가 상태 백엔드(S3)에 로그인돼 있고 infra/ 에 스택 production 이 있다(infra/README.md). 설정 암호는 비어 있다.
# - AWS CLI 의 프로필 old-admin 이 있다. 이 스크립트는 그 프로필만 쓴다. default, memoriq 프로필은 다른 회사 계정이라 쓰지 않는다.
# - docker buildx 가 linux/arm64 로 빌드할 수 있다(Docker Desktop 기본 빌더면 된다). 안 되면:
#     docker buildx create --name beside-pet --use
#
# 순서
# 1. 작업 트리가 더러우면 멈춘다(배포한 이미지와 커밋이 어긋나지 않게).
# 2. 태그 = git rev-parse --short HEAD.
# 3. pulumi stack output 에서 ecrRegistry, instanceId, awsRegion, awsProfile 을 읽는다.
# 4. ECR 에 docker login.
# 5. 레포 루트를 컨텍스트로 api(apps/server/Dockerfile), web(apps/web/Dockerfile) 을 linux/arm64 로 빌드해 push 한다.
#    web 은 NEXT_PUBLIC_API_BASE_URL 을 비워 같은 출처의 상대 경로(/v1/*)로 API 를 부른다.
# 6. SSM send-command 로 인스턴스의 /opt/beside-pet/host-deploy.sh <태그> 를 돌리고, 끝날 때까지 기다려
#    상태와 표준 출력·오류의 꼬리를 보여 준다. 성공이 아니면 1 로 끝난다.
#
# 이 스크립트는 비밀 값(.env.production, SSM 파라미터)을 읽거나 출력하지 않는다. 그 값은 호스트 스크립트가 다룬다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="production"
# S3 백엔드는 설정 암호를 요구한다. 이 스택은 설정에 비밀을 두지 않아 빈 암호로 간다(infra/README.md "상태 백엔드").
# 사용자가 다른 값을 두었으면 그것을 쓴다.
export PULUMI_CONFIG_PASSPHRASE="${PULUMI_CONFIG_PASSPHRASE:-}"
PROFILE="old-admin"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"
TAIL_LINES=30

cd "$REPO_ROOT"

for cmd in git pulumi aws docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "배포에 필요한 명령이 없다: $cmd" >&2
    exit 1
  fi
done

# 1. 작업 트리
if [ -n "$(git status --porcelain)" ]; then
  {
    echo "작업 트리가 더럽다. 커밋하거나 치운 뒤 다시 돌린다(이미지 태그가 커밋을 가리켜야 한다):"
    git status --short
  } >&2
  exit 1
fi

# 2. 태그
TAG="$(git rev-parse --short HEAD)"

# 3. 스택 출력
stack_output() {
  local name="$1" value
  if ! value="$(cd "$REPO_ROOT/infra" && pulumi stack output "$name" -s "$STACK" 2>/dev/null)" || [ -z "$value" ]; then
    echo "pulumi 스택 $STACK 의 출력 $name 을 읽지 못했다. pulumi login 과 스택(infra/README.md)을 확인한다." >&2
    exit 1
  fi
  printf '%s' "$value"
}

REGISTRY="$(stack_output ecrRegistry)"
INSTANCE_ID="$(stack_output instanceId)"
REGION="$(stack_output awsRegion)"
STACK_PROFILE="$(stack_output awsProfile)"

if [ "$STACK_PROFILE" != "$PROFILE" ]; then
  echo "스택의 awsProfile($STACK_PROFILE)이 이 제품의 프로필($PROFILE)과 다르다. 다른 계정에 닿지 않게 멈춘다." >&2
  exit 1
fi
export AWS_PROFILE="$PROFILE"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

echo "배포: 태그 $TAG, 레지스트리 $REGISTRY, 인스턴스 $INSTANCE_ID ($REGION, 프로필 $PROFILE)"

# 4. ECR 로그인
aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# 5. 빌드와 push
if ! docker buildx version >/dev/null 2>&1; then
  {
    echo "docker buildx 가 없다. Docker Desktop 을 쓰거나 buildx 플러그인을 설치한 뒤 빌더를 만든다:"
    echo "  docker buildx create --name beside-pet --use"
  } >&2
  exit 1
fi

echo "api 이미지를 빌드해 올린다: $REGISTRY/beside-pet-api:$TAG"
docker buildx build --platform linux/arm64 \
  -f apps/server/Dockerfile \
  -t "$REGISTRY/beside-pet-api:$TAG" \
  --push .

echo "web 이미지를 빌드해 올린다: $REGISTRY/beside-pet-web:$TAG"
docker buildx build --platform linux/arm64 \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL= \
  -t "$REGISTRY/beside-pet-web:$TAG" \
  --push .

# 6. SSM 으로 호스트 배포
COMMAND_ID="$(aws ssm send-command \
  --region "$REGION" --profile "$PROFILE" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "commands=[\"/opt/beside-pet/host-deploy.sh $TAG\"]" \
  --comment "beside-pet deploy $TAG" \
  --query 'Command.CommandId' --output text)"

echo "호스트 배포를 보냈다(명령 $COMMAND_ID). 끝날 때까지 기다린다."

invocation() {
  aws ssm get-command-invocation \
    --region "$REGION" --profile "$PROFILE" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query "$1" --output text 2>/dev/null
}

STATUS="Pending"
waited=0
while :; do
  if [ "$waited" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "  ${MAX_WAIT_SECONDS}초를 기다려도 끝나지 않았다. 기다림을 멈춘다(명령은 호스트에서 계속 돌 수 있다)." >&2
    break
  fi
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
  # 보낸 직후에는 InvocationDoesNotExist 가 날 수 있어 실패를 기다림으로 본다.
  STATUS="$(invocation Status || echo Pending)"
  case "$STATUS" in
    Success | Failed | Cancelled | TimedOut) break ;;
    *) echo "  상태: $STATUS" ;;
  esac
done

echo "호스트 배포 상태: $STATUS"
echo "--- 표준 출력(마지막 ${TAIL_LINES}줄) ---"
invocation StandardOutputContent | tail -n "$TAIL_LINES" || true
echo "--- 표준 오류(마지막 ${TAIL_LINES}줄) ---"
invocation StandardErrorContent | tail -n "$TAIL_LINES" || true

if [ "$STATUS" != "Success" ]; then
  echo "배포가 끝나지 않았다($STATUS). 위 출력을 확인한다." >&2
  exit 1
fi

echo "배포가 끝났다: 태그 $TAG"
