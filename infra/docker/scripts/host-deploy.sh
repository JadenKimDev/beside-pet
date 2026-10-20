#!/usr/bin/env bash
# EC2 인스턴스 안에서 production 을 주어진 이미지 태그로 올린다.
#
#   /opt/beside-pet/host-deploy.sh <IMAGE_TAG>      # 예: /opt/beside-pet/host-deploy.sh 831aaab
#
# Mac 의 infra/scripts/deploy.sh 가 SSM Run Command(AWS-RunShellScript)로 root 권한으로 부른다.
# 쉘에서 손으로 돌릴 때도 같다(SSM Session Manager 에서 sudo).
#
# 전제
# - 이 파일과 compose.host.yaml 이 /opt/beside-pet/ 에 있다(infra/host 의 user-data 가 놓는다).
# - docker 와 compose 플러그인, aws CLI 가 깔려 있다(AL2023 은 aws CLI 를 기본으로 갖는다).
# - 인스턴스 역할이 ECR 읽기(GetAuthorizationToken, BatchGetImage, GetDownloadUrlForLayer)와
#   SSM 파라미터 /beside-pet/production/server-env 의 GetParameter(복호화 포함) 권한을 가진다.
# - 그 파라미터(SecureString)에 apps/server/.env.production 의 내용이 그대로 들어 있다(사용자가 넣는다).
#
# 하는 일: IMDSv2 로 리전과 계정을 읽어 ECR 레지스트리 주소를 만든다 → ECR 로그인 →
# 파라미터를 /opt/beside-pet/.env.production(0600)으로 내려 쓴다 → compose pull → up -d --wait → image prune.
#
# 파라미터 값과 .env.production 의 내용은 어디에도 찍지 않는다. set -x 를 쓰지 않는다.

set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "쓰는 법: $0 <IMAGE_TAG>" >&2
  exit 2
fi
IMAGE_TAG="$1"

DEPLOY_DIR=/opt/beside-pet
COMPOSE_FILE="$DEPLOY_DIR/compose.host.yaml"
ENV_FILE="$DEPLOY_DIR/.env.production"
PARAM_NAME=/beside-pet/production/server-env

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "compose 파일이 없다: $COMPOSE_FILE" >&2
  exit 1
fi

# --- 리전과 계정: IMDSv2(토큰을 먼저 받는다).
imds_token="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
imds() {
  curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" "http://169.254.169.254/latest/$1"
}
AWS_REGION="$(imds meta-data/placement/region)"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
ACCOUNT_ID="$(imds dynamic/instance-identity/document | sed -n 's/.*"accountId"[[:space:]]*:[[:space:]]*"\([0-9]*\)".*/\1/p')"
if [ -z "$ACCOUNT_ID" ]; then
  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
export IMAGE_TAG ECR_REGISTRY

echo "배포: 태그 $IMAGE_TAG, 레지스트리 $ECR_REGISTRY"

# --- ECR 로그인. 비밀번호는 파이프로만 넘긴다.
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
echo "ECR 로그인 끝"

# --- 서버 설정: 파라미터를 임시 파일(0600)에 받아 제자리로 옮긴다. 값은 출력하지 않는다.
umask 077
tmp_env="$(mktemp "$DEPLOY_DIR/.env.production.XXXXXX")"
trap 'rm -f "$tmp_env"' EXIT
aws ssm get-parameter --name "$PARAM_NAME" --with-decryption \
  --query Parameter.Value --output text >"$tmp_env"
chmod 0600 "$tmp_env"
if [ ! -s "$tmp_env" ]; then
  echo "파라미터 $PARAM_NAME 가 비어 있다" >&2
  exit 1
fi
mv -f "$tmp_env" "$ENV_FILE"
trap - EXIT
echo "서버 설정을 $ENV_FILE 에 썼다(0600)"

# --- 이미지를 받고 올린다. --wait 는 db 와 web 의 healthcheck(web 은 api 의 /v1/health 까지 본다)를 기다린다.
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --wait --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

docker image prune -f >/dev/null
echo "배포 끝: $IMAGE_TAG"
