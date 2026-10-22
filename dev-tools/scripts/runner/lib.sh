# shellcheck shell=bash
# implement.sh 가 source 하는 댓글·요약 조립 함수. 부작용(댓글, 라벨, 종료)은 없고 stdout 이나
# GITHUB_STEP_SUMMARY 파일에만 쓴다. lib.test.sh 가 따로 검사한다.
#
# 부르는 쪽이 정하는 전역 변수: ISSUE(이슈 번호), STAMP(로그 이름의 시각), WT_PATH(워크트리 경로, 없으면 빈 값).

# 공개 이슈에 싣는 경로. 이 Mac 의 홈(사용자 이름)을 ~ 로 가린다.
shown() { local p="$1"; if [ -n "${HOME:-}" ] && [ "${p#"$HOME"}" != "$p" ]; then p="~${p#"$HOME"}"; fi; printf '%s' "$p"; }

# 글 안 어디에 있든 홈 경로를 ~ 로 가린다(실행 요약처럼 명령 문자열이 섞이는 곳에 쓴다).
mask_home() { local t="$1" tl="~"; if [ -n "${HOME:-}" ]; then t="${t//"$HOME"/$tl}"; fi; printf '%s' "$t"; }

# 사람이 이어 하는 법. 댓글 끝에 붙인다.
resume_hint() {
  # 워크트리가 아직 없으면(원장 확인에서 막힘) cd 할 곳이 없으니 wt:pane 만 안내한다.
  local how="\`pnpm wt:pane $ISSUE\`"
  if [ -n "${WT_PATH:-}" ]; then how="$how 또는 \`cd $(shown "$WT_PATH") && HARNESS_IMPL=$ISSUE claude '/implement-prd $ISSUE'\`"; fi
  printf '%s\n' "" "**이어 하기**: 이 Mac 에서 $how." \
    "고친 뒤 다시 돌리려면 라벨 \`run:again\` 을 붙인다. 러너 로그: \`outputs/runner/$ISSUE/$STAMP*.log\` (러너 호스트 $(hostname -s))."
}

# 막힘 댓글의 본문. 첫 인자는 이유, 나머지는 목록 줄.
blocked_comment() {
  local reason="$1"; shift
  echo "### 러너: 막혔습니다 (#$ISSUE)"
  echo ""
  echo "$reason"
  if [ "$#" -gt 0 ]; then echo ""; printf -- '- %s\n' "$@"; fi
  resume_hint
}

# Actions 실행 요약에 마크다운 줄을 붙인다. GITHUB_STEP_SUMMARY 가 없으면(터미널에서 돌릴 때) 건너뛴다.
# 홈 경로는 가린다. 실패해도 부르는 쪽을 멈추지 않는다.
step_summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] || return 0
  local line
  for line in "$@" ""; do mask_home "$line"; printf '\n'; done >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true
}

# 결과별 요약. 막힘: 이유와 목록, 이어 하기. 성공: review:ready 와 커밋. 고장: 행과 명령.
summary_blocked() {
  local reason="$1"; shift
  local lines=("### 러너 #$ISSUE" "" "막힘: $reason")
  if [ "$#" -gt 0 ]; then lines+=(""); local r; for r in "$@"; do lines+=("- $r"); done; fi
  local hint; hint="$(resume_hint)"
  lines+=("$hint")
  step_summary "${lines[@]}"
}
summary_ready() { step_summary "### 러너 #$ISSUE" "" "review:ready, 커밋 \`$1\`"; }
summary_broken() { step_summary "### 러너 #$ISSUE" "" "고장: implement.sh $1 행, 명령 \`${2:0:200}\` (종료 코드 $3)"; }
