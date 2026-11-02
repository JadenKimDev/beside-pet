#!/usr/bin/env bash
# production(AWS EC2)의 DB 에 읽기 전용 SELECT 를 SSM 으로 보내고 결과를 보여 준다. `pnpm prod:query` 가 부른다.
# 절차와 지키는 선은 .claude/skills/prod-query/SKILL.md.
#
#   pnpm prod:query "select status, count(*) from accounts group by status"
#   pnpm prod:query < query.sql
#   MAX_WAIT_SECONDS=120 pnpm prod:query "..."   # 결과를 기다리는 최대 시간(기본 60초)
#
# 지키는 것
# - SELECT 와 WITH 로 시작하는 문만 보낸다. 쓰기 낱말, psql 의 역슬래시 명령, 본문 칸 이름(루트 CLAUDE.md "읽지 않는 것",
#   infra/docker/scripts/sandbox-scrub.sql 의 칸 표, accounts.username·password_hash)이 보이면 보내지 않는다.
# - 호스트에서도 트랜잭션을 읽기 전용(default_transaction_read_only)으로, 문 하나를 10초로 묶어 돌린다.
# - 프로필은 old-admin 만 쓴다. 비밀 값(SSM 파라미터, .env)은 읽지 않는다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="production"
export PULUMI_CONFIG_PASSPHRASE="${PULUMI_CONFIG_PASSPHRASE:-}"
PROFILE="old-admin"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-60}"

for cmd in pulumi aws jq base64; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "필요한 명령이 없다: $cmd" >&2; exit 1; }
done

if [ $# -gt 0 ]; then SQL="$*"; else SQL="$(cat)"; fi
if [ -z "${SQL//[[:space:]]/}" ]; then
  echo "보낼 SQL 이 없다. pnpm prod:query \"select ...\"" >&2
  exit 1
fi

# --- 보내기 전 검사 ---
reject() { echo "보내지 않는다: $1" >&2; exit 2; }
lower="$(printf '%s' "$SQL" | tr '[:upper:]' '[:lower:]')"
case "$lower" in *\\*) reject "psql 의 역슬래시 명령은 쓰지 않는다" ;; esac
# 주석은 검사를 가릴 수 있어 받지 않는다.
case "$lower" in *--* | */\**) reject "주석은 받지 않는다" ;; esac
word() { printf '%s' "$lower" | grep -Eq "(^|[^a-z0-9_])($1)([^a-z0-9_]|\$)"; }
if word 'insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|set|reset|begin|commit|rollback|do|call|lock|vacuum|analyze|cluster|reindex|refresh|listen|notify|prepare|execute|dblink[a-z_]*|lo_[a-z_]+|pg_read[a-z_]*|pg_ls_dir|pg_terminate_backend|pg_cancel_backend|set_config'; then
  reject "읽기 전용이 아닌 낱말이 있다"
fi
# 본문 칸: 루트 CLAUDE.md "읽지 않는 것"과 sandbox-scrub.sql 의 칸 표. 본문 칸을 더하면 여기에도 더한다.
if word 'text|name|grief_profile|report|supervision|summary|history|username|password_hash|email'; then
  reject "본문이나 계정 이름 칸이 있다(행 수와 상태 칸만 본다). ::text 같은 형 변환도 이 검사에 걸리니 다른 형을 쓴다"
fi
case "$lower" in *'*'*) case "$lower" in *'count(*)'*) ;; *) reject "select * 는 쓰지 않는다. 칸을 이름으로 고른다" ;; esac ;; esac
# 문마다 select 나 with 로 시작해야 한다.
while IFS= read -r stmt; do
  stmt="$(printf '%s' "$stmt" | sed -E 's/^[[:space:]]+//')"
  [ -z "$stmt" ] && continue
  printf '%s' "$stmt" | grep -Eq '^(select|with)([^a-z0-9_]|$)' || reject "select 나 with 로 시작하지 않는 문이 있다"
done < <(printf '%s' "$lower" | tr '\n' ' ' | tr ';' '\n')

# --- 스택 출력 ---
stack_output() {
  local value
  if ! value="$(cd "$REPO_ROOT/infra" && pulumi stack output "$1" -s "$STACK" 2>/dev/null)" || [ -z "$value" ]; then
    echo "pulumi 스택 $STACK 의 출력 $1 을 읽지 못했다. pulumi login 과 스택(infra/README.md)을 확인한다." >&2
    exit 1
  fi
  printf '%s' "$value"
}
INSTANCE_ID="$(stack_output instanceId)"
REGION="$(stack_output awsRegion)"

# --- 호스트에서 돌 명령 ---
# SQL 은 base64 로 실어 따옴표가 섞이지 않게 한다. db 컨테이너는 compose 라벨로 찾는다(이름에 기대지 않는다).
B64="$(printf '%s' "$SQL" | base64 | tr -d '\n')"
REMOTE="C=\$(docker ps -q -f label=com.docker.compose.project=beside-production -f label=com.docker.compose.service=db); if [ -z \"\$C\" ]; then echo 'production db 컨테이너를 찾지 못했다. 떠 있는 컨테이너:' >&2; docker ps --format '{{.Names}}' >&2; exit 1; fi; echo $B64 | base64 -d | docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000' \"\$C\" psql -X -U beside -d besidepet -v ON_ERROR_STOP=1 -f -"
PARAMS="$(jq -cn --arg c "$REMOTE" '{commands: [$c]}')"

COMMAND_ID="$(aws ssm send-command \
  --region "$REGION" --profile "$PROFILE" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$PARAMS" \
  --comment "beside-pet read-only query" \
  --query 'Command.CommandId' --output text)"

invocation() {
  aws ssm get-command-invocation \
    --region "$REGION" --profile "$PROFILE" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query "$1" --output text 2>/dev/null
}

STATUS="Pending"
waited=0
while [ "$waited" -lt "$MAX_WAIT_SECONDS" ]; do
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
  STATUS="$(invocation Status || echo Pending)"
  case "$STATUS" in Success | Failed | Cancelled | TimedOut) break ;; esac
done

echo "상태: $STATUS (명령 $COMMAND_ID)"
OUT="$(invocation StandardOutputContent || true)"
ERR="$(invocation StandardErrorContent || true)"
[ -n "$OUT" ] && printf '%s\n' "$OUT"
[ -n "$ERR" ] && { echo "--- 오류 출력 ---"; printf '%s\n' "$ERR"; } >&2
case "$STATUS" in
  Success) exit 0 ;;
  Pending | InProgress | Delayed) echo "${MAX_WAIT_SECONDS}초 안에 끝나지 않았다. MAX_WAIT_SECONDS 를 늘려 다시 돌린다." >&2; exit 1 ;;
  *) exit 1 ;;
esac
