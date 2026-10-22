#!/usr/bin/env bash
# 러너가 이슈 하나를 구현한다. GitHub Actions 의 self-hosted 러너(라벨 beside-pet-mac)가 부른다.
#
#   dev-tools/scripts/runner/implement.sh <이슈>
#
# 순서: 본 체크아웃 갱신 → 원장 확인(없음, doing, needs_spec, parked 이면 멈춤) → wt:create(있으면 재사용)
# → 시작 댓글 → 워크트리에서 claude -p '/implement-prd <이슈>' → 판정 → 보고 댓글과 라벨 정리.
# 성공이면 review:ready 를 붙이고 run:implement, run:again, run:blocked 를 뗀다. 막히면 run:blocked 를 붙이고
# run:implement, run:again 을 뗀다. QA 스크린샷은 gh --attach 로 따로 댓글 하나에 올린다(되지 않으면 로그만).
#
# 환경 변수
#   BESIDE_PET_REPO     본 체크아웃 경로. 없으면 이 스크립트가 든 레포의 본 체크아웃.
#   RUNNER_MAX_TURNS    claude -p 의 --max-turns (기본 400).
#   RUNNER_LABEL        워크플로가 넘기는 트리거 라벨(run:implement 또는 run:again). 댓글에만 쓴다.
#   GH_TOKEN            러너 환경에 둔 JadenKimDev 의 fine-grained 토큰. 이 스크립트는 값을 출력하지 않는다.
#
# 지키는 것: .env 의 값과 DB 본문을 읽지 않는다. production 에 닿는 명령(deploy:prod 등)은 부르지 않는다.
# 로그는 outputs/runner/<이슈>/ (gitignore) 에 남는다. set -x 를 쓰지 않는다(토큰이 로그에 남지 않게).

set -Eeuo pipefail

ISSUE="${1:-}"
[[ "$ISSUE" =~ ^[0-9]+$ ]] || { sed -n '2,4p' "$0" >&2; exit 2; }

if [ -n "${BESIDE_PET_REPO:-}" ]; then
  REPO_ROOT="$(cd "$BESIDE_PET_REPO" && pwd)"
else
  REPO_ROOT="$(cd "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
fi
MAX_TURNS="${RUNNER_MAX_TURNS:-400}"
TRIGGER="${RUNNER_LABEL:-run:implement}"
STAMP="$(date +%Y%m%dT%H%M%S)"
LOG_DIR="$REPO_ROOT/outputs/runner/$ISSUE"
CLAUDE_LOG="$LOG_DIR/$STAMP.log"
TEST_LOG="$LOG_DIR/$STAMP-test.log"
RUN_LOG="$LOG_DIR/$STAMP-runner.log"
LOCK_DIR="$LOG_DIR/.lock"
mkdir -p "$LOG_DIR"
# 이 스크립트의 출력도 파일에 남긴다(워크플로 로그와 같은 내용).
exec > >(tee -a "$RUN_LOG") 2>&1

GH_REPO_SLUG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["repo"])' "$REPO_ROOT/project.config.json")"
WT_PATH=""
FINISHED=0

log() { echo "[runner #$ISSUE $(date +%H:%M:%S)] $*"; }

# 공개 이슈에 싣는 경로. 이 Mac 의 홈(사용자 이름)을 ~ 로 가린다.
shown() { local p="$1"; if [ -n "${HOME:-}" ] && [ "${p#"$HOME"}" != "$p" ]; then p="~${p#"$HOME"}"; fi; printf '%s' "$p"; }

# 댓글을 단다. 작업 대장 CLI 가 먼저이고, 그것이 실패하면 gh 로 바로 단다.
comment() {
  local file="$1"
  if (cd "$REPO_ROOT" && pnpm -s issue:comment "$ISSUE" --file "$file"); then return 0; fi
  log "issue:comment 실패, gh 로 다시 시도합니다"
  gh issue comment "$ISSUE" --repo "$GH_REPO_SLUG" --body-file "$file"
}

# 라벨을 바꾼다. 작업 대장 CLI 가 먼저이고, 실패하면 gh 로.
relabel() {
  local add="$1" remove="$2" cli=() gh_args=()
  if [ -n "$add" ]; then cli+=(--add "$add"); gh_args+=(--add-label "$add"); fi
  if [ -n "$remove" ]; then cli+=(--remove "$remove"); gh_args+=(--remove-label "$remove"); fi
  if (cd "$REPO_ROOT" && pnpm -s issue:label "$ISSUE" "${cli[@]}"); then return 0; fi
  log "issue:label 실패, gh 로 다시 시도합니다"
  gh issue edit "$ISSUE" --repo "$GH_REPO_SLUG" "${gh_args[@]}"
}

comment_text() {
  local f; f="$(mktemp "$LOG_DIR/comment.XXXXXX")"
  printf '%s\n' "$@" > "$f"
  comment "$f"
  rm -f "$f"
}

# 사람이 이어 하는 법. 댓글 끝에 붙인다.
resume_hint() {
  # 워크트리가 아직 없으면(원장 확인에서 막힘) cd 할 곳이 없으니 wt:pane 만 안내한다.
  local how="\`pnpm wt:pane $ISSUE\`"
  if [ -n "${WT_PATH:-}" ]; then how="$how 또는 \`cd $(shown "$WT_PATH") && HARNESS_IMPL=$ISSUE claude '/implement-prd $ISSUE'\`"; fi
  printf '%s\n' "" "**이어 하기**: 이 Mac 에서 $how." \
    "고친 뒤 다시 돌리려면 라벨 \`run:again\` 을 붙인다. 러너 로그: \`outputs/runner/$ISSUE/$STAMP*.log\` (러너 호스트 $(hostname -s))."
}

# 막혔다: 이유를 댓글로 남기고 run:blocked 를 붙인다. 댓글이나 라벨이 실패해도 끝까지 간다.
block() {
  local reason="$1"; shift
  FINISHED=1
  log "막힘: $reason"
  local f; f="$(mktemp "$LOG_DIR/comment.XXXXXX")"
  {
    echo "### 러너: 막혔습니다 (#$ISSUE)"
    echo ""
    echo "$reason"
    if [ "$#" -gt 0 ]; then echo ""; printf -- '- %s\n' "$@"; fi
    resume_hint
  } > "$f"
  if comment "$f"; then rm -f "$f"; else log "막힘 댓글을 달지 못했습니다: $f 에 남겨 둡니다"; fi
  relabel run:blocked run:implement,run:again || log "run:blocked 라벨을 붙이지 못했습니다"
  exit 1
}

# 어떤 외부 명령이든 예상하지 못하게 실패하면 여기로 온다.
on_error() {
  local code=$? line="$1" cmd="$2"
  trap - ERR
  set +e
  if [ "$FINISHED" = 1 ]; then exit "$code"; fi
  block "러너 스크립트가 실패했습니다 (종료 코드 $code, implement.sh $line 행)." "실패한 명령: \`${cmd:0:200}\`"
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

release_lock() { rm -rf "$LOCK_DIR"; }

# QA 스크린샷을 댓글 하나로 올린다. gh 2.99 이상의 --attach 가 있을 때만 하고, 실패해도 판정을 바꾸지 않는다.
# 파일은 outputs/qa/<이슈>/ 바로 아래의 이미지이고, 한 번에 50장까지(gh 의 한도).
attach_screenshots() {
  local dir="$REPO_ROOT/outputs/qa/$ISSUE" files=() args=() f
  [ -d "$dir" ] || return 0
  while IFS= read -r f; do files+=("$f"); done < <(cd "$dir" && find . -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' -o -iname '*.webp' \) | sed 's|^\./||' | sort | head -50)
  [ "${#files[@]}" -gt 0 ] || return 0
  if ! gh issue comment --help 2>/dev/null | grep -q -- '--attach'; then
    log "gh 에 --attach 가 없어 스크린샷을 올리지 않습니다(gh 2.99 이상 필요). 파일은 outputs/qa/$ISSUE/ 에 있습니다"
    return 0
  fi
  for f in "${files[@]}"; do args+=(--attach "./$f#$f"); done
  local body; body="$(mktemp "$LOG_DIR/comment.XXXXXX")"
  printf '%s\n' "### 러너: QA 스크린샷 (#$ISSUE)" "" "\`outputs/qa/$ISSUE/\` 의 이미지 ${#files[@]}장." > "$body"
  if (cd "$dir" && gh issue comment "$ISSUE" --repo "$GH_REPO_SLUG" --body-file "$body" "${args[@]}"); then
    log "스크린샷 ${#files[@]}장을 올렸습니다"
  else
    log "스크린샷을 올리지 못했습니다. 파일은 outputs/qa/$ISSUE/ 에 있습니다"
  fi
  rm -f "$body"
}

# 같은 이슈를 이 러너가 이미 돌리고 있으면 멈춘다(워크플로의 concurrency 위의 두 번째 울타리).
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  other="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
    FINISHED=1
    comment_text "### 러너: 이미 진행 중입니다 (#$ISSUE)" "" "이 러너가 같은 이슈를 돌리고 있습니다(pid $other). 이번 요청은 아무것도 하지 않고 끝냅니다." \
      || log "진행 중 댓글을 달지 못했습니다"
    exit 0
  fi
  log "남은 잠금을 치웁니다(pid ${other:-없음} 은 살아 있지 않음)"
  rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap release_lock EXIT

# 1. 본 체크아웃 갱신. main 이 아니거나 더러우면 pull 이 엉뚱한 곳을 건드리므로 멈춘다.
[ "$(git -C "$REPO_ROOT" branch --show-current)" = main ] || block "본 체크아웃($(shown "$REPO_ROOT"))이 main 이 아닙니다."
git -C "$REPO_ROOT" pull --ff-only || block "본 체크아웃을 갱신하지 못했습니다(\`git pull --ff-only\`)."

# 원장 하나의 작업 상태를 "id status" 줄로 뽑는다.
ledger_tasks() {
  python3 -c 'import json,sys
for t in json.load(open(sys.argv[1]))["tasks"]: print(t["id"], t["status"])' "$1"
}
tasks_with() { awk -v s="$2" '$2 == s { print $1 }' <<<"$1" | paste -sd, -; }

# 2. 원장 확인.
MAIN_LEDGER="$REPO_ROOT/docs/ledger/$ISSUE.json"
[ -f "$MAIN_LEDGER" ] || block "원장이 없습니다: \`docs/ledger/$ISSUE.json\`. PRD 를 승인하고 \`pnpm ledger:new\` 로 원장을 만들어 main 에 커밋한 뒤 다시 라벨을 붙이세요."

existing_wt() {
  git -C "$REPO_ROOT" worktree list --porcelain | BR="refs/heads/prd/$ISSUE" python3 -c 'import os,sys
path=None
for line in sys.stdin.read().splitlines():
    if line.startswith("worktree "): path=line[len("worktree "):]
    elif line == "branch " + os.environ["BR"]: print(path); break'
}

# 워크트리가 이미 있으면 그쪽 원장이 진행 상황의 정본이다(run:again).
WT_PATH="$(existing_wt)"
LEDGER="$MAIN_LEDGER"
if [ -n "$WT_PATH" ] && [ -f "$WT_PATH/docs/ledger/$ISSUE.json" ]; then LEDGER="$WT_PATH/docs/ledger/$ISSUE.json"; fi
TASKS="$(ledger_tasks "$LEDGER")"
doing="$(tasks_with "$TASKS" doing)"
if [ -n "$doing" ]; then
  FINISHED=1
  comment_text "### 러너: 누가 하고 있습니다 (#$ISSUE)" "" "원장에 \`doing\` 인 작업이 있습니다: $doing. 다른 세션(pane)이 진행 중이라 러너는 시작하지 않습니다." \
    "끝난 뒤 다시 돌리려면 라벨 \`run:again\` 을 붙이세요." || log "진행 중 댓글을 달지 못했습니다"
  relabel "" run:implement,run:again || log "라벨을 떼지 못했습니다"
  exit 0
fi
needs="$(tasks_with "$TASKS" needs_spec)"
[ -z "$needs" ] || block "검증 방법이 정해지지 않은 작업(\`needs_spec\`)이 있습니다: $needs. 러너에는 답할 사람이 없어 시작하지 않습니다. PRD 의 검증 칸을 채우고 원장을 고친 뒤 \`run:again\` 을 붙이세요."
parked="$(tasks_with "$TASKS" parked)"
[ -z "$parked" ] || block "\`parked\` 인 작업이 있습니다: $parked. 사람이 원인을 보고 정한 뒤 \`run:again\` 을 붙이세요."

# 3. 워크트리. wt.sh 가 이미 있으면 재사용한다.
(cd "$REPO_ROOT" && pnpm -s wt:create "$ISSUE") || block "워크트리를 만들지 못했습니다(\`pnpm wt:create $ISSUE\`)."
WT_PATH="$(existing_wt)"
[ -n "$WT_PATH" ] || block "\`wt:create\` 뒤에도 \`prd/$ISSUE\` 워크트리를 찾지 못했습니다."
[ -z "$(git -C "$WT_PATH" status --porcelain)" ] || block "워크트리에 커밋하지 않은 변경이 있습니다: \`$(shown "$WT_PATH")\`. 사람이 정리한 뒤 \`run:again\` 을 붙이세요."

# 4. 시작 댓글.
comment_text "### 러너: 시작했습니다 (#$ISSUE)" "" "- 호스트: $(hostname -s)" "- 시각: $(date '+%Y-%m-%d %H:%M:%S %Z')" \
  "- 트리거: \`$TRIGGER\`" "- 워크트리: \`$(shown "$WT_PATH")\` (\`$(git -C "$WT_PATH" rev-parse --short HEAD)\`)" "- 최대 턴: $MAX_TURNS" \
  || block "시작 댓글을 달지 못했습니다."

# 5. 구현 세션. 실패해도 판정까지 간다.
log "claude -p 시작 (로그 $CLAUDE_LOG)"
set +e
(cd "$WT_PATH" && HARNESS_IMPL="$ISSUE" HARNESS_RUNNER=1 claude -p "/implement-prd $ISSUE" \
  --permission-mode auto --max-turns "$MAX_TURNS" --output-format json) > "$CLAUDE_LOG" < /dev/null
CLAUDE_EXIT=$?
set -e
log "claude -p 끝 (종료 코드 $CLAUDE_EXIT)"

# 6. 판정. 이유를 모아 하나라도 있으면 막힘이다.
REASONS=()
[ "$CLAUDE_EXIT" = 0 ] || REASONS+=("\`claude -p\` 가 종료 코드 $CLAUDE_EXIT 로 끝났습니다.")

# claude 의 JSON 결과: subtype, is_error, num_turns, permission_denials(분류기가 막은 명령).
CLAUDE_SUMMARY="$(python3 - "$CLAUDE_LOG" <<'PY' || echo "결과 JSON 을 읽지 못했습니다(로그를 보세요)."
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    print("결과 JSON 을 읽지 못했습니다(로그를 보세요)."); sys.exit(0)
if isinstance(data, list):
    data = next((d for d in reversed(data) if isinstance(d, dict) and d.get("type") == "result"), {})
sub = data.get("subtype"); err = data.get("is_error")
if sub != "success" or err:
    print(f"세션 결과가 성공이 아닙니다: subtype={sub}, is_error={err}, 턴 {data.get('num_turns')}.")
for d in data.get("permission_denials") or []:
    tool = d.get("tool_name", "?"); inp = d.get("tool_input") or {}
    what = inp.get("command") or inp.get("file_path") or ""
    what = " ".join(str(what).split())[:160]
    print(f"분류기가 막은 도구: {tool} `{what}`")
PY
)"
while IFS= read -r line; do
  if [ -n "$line" ]; then REASONS+=("$line"); fi
done <<<"$CLAUDE_SUMMARY"

# 원장: 워크트리의 원장이 정본이다. pnpm finish 가 지웠으면 마감까지 간 것이다.
WT_LEDGER="$WT_PATH/docs/ledger/$ISSUE.json"
if [ -f "$WT_LEDGER" ]; then
  TASKS="$(ledger_tasks "$WT_LEDGER")"
  for s in parked needs_spec doing todo; do
    ids="$(tasks_with "$TASKS" "$s")"
    if [ -n "$ids" ]; then REASONS+=("원장에 \`$s\` 인 작업이 남았습니다: $ids."); fi
  done
  (cd "$WT_PATH" && pnpm -s ledger:status "$ISSUE") || true
fi

# QA 보고서에 확인 불가가 있으면 사람이 봐야 한다.
QA_REPORT="$REPO_ROOT/outputs/qa/$ISSUE/report.html"
if [ -f "$QA_REPORT" ] && grep -q "확인 불가" "$QA_REPORT"; then
  REASONS+=("QA 보고서에 \`확인 불가\` 항목이 있습니다: \`outputs/qa/$ISSUE/report.html\`.")
fi

ISSUE_STATE="$(gh issue view "$ISSUE" --repo "$GH_REPO_SLUG" --json state -q .state 2>/dev/null || echo "알 수 없음")"
log "이슈 상태: $ISSUE_STATE"

# 세션이 끝까지 간 경우에만 pnpm test 를 돌려 보고에 싣는다.
TEST_ARGS=()
if [ "${#REASONS[@]}" -eq 0 ]; then
  log "pnpm test (로그 $TEST_LOG)"
  test_exit=0
  (cd "$WT_PATH" && pnpm test) > "$TEST_LOG" 2>&1 < /dev/null || test_exit=$?
  if [ "$test_exit" != 0 ]; then REASONS+=("워크트리에서 \`pnpm test\` 가 종료 코드 $test_exit 로 실패했습니다."); fi
  TEST_ARGS=(--test-log "$TEST_LOG" --test-exit "$test_exit")
fi

# 7. 보고. 작성기는 마크다운을 stdout 에 쓴다. 원장과 outcomes.jsonl 의 최신본은 워크트리에 있으므로 워크트리에서 부른다.
SHA="$(git -C "$WT_PATH" rev-parse HEAD)"
REPORT="$LOG_DIR/$STAMP-report.md"
REPORT_ARGS=(--sha "$SHA" "${TEST_ARGS[@]+"${TEST_ARGS[@]}"}")
if [ -f "$QA_REPORT" ]; then REPORT_ARGS+=(--qa "$QA_REPORT"); fi
if ! (cd "$WT_PATH" && pnpm -s runner:report "$ISSUE" "${REPORT_ARGS[@]}") > "$REPORT"; then
  printf '%s\n' "### 러너 결과 (#$ISSUE)" "" "보고 작성기(\`runner:report\`)가 실패했습니다. 커밋 \`$SHA\`, 이슈 상태 $ISSUE_STATE." > "$REPORT"
  REASONS+=("보고 작성기(\`runner:report\`)가 실패했습니다.")
fi

if [ "${#REASONS[@]}" -gt 0 ]; then
  comment "$REPORT" || log "결과 댓글을 달지 못했습니다: $REPORT"
  attach_screenshots || true
  block "구현 세션이 끝까지 가지 못했습니다 (이슈 상태 $ISSUE_STATE)." "${REASONS[@]}"
fi

FINISHED=1
comment "$REPORT"
attach_screenshots || true
relabel review:ready run:implement,run:again,run:blocked
log "끝: review:ready"
