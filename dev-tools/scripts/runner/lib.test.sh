#!/usr/bin/env bash
# lib.sh 의 댓글·요약 조립과 implement.sh 의 종료 코드(막힘 0, 고장 1)를 검사한다.
#
#   bash dev-tools/scripts/runner/lib.test.sh
#
# 실패가 하나라도 있으면 종료 코드 1. GitHub 과 네트워크에는 닿지 않는다: 가짜 HOME 아래 임시 레포와
# 로컬 bare 원격을 만들고, pnpm 과 gh 는 PATH 앞의 가짜 명령으로 바꾼다. 임시 디렉터리는 끝에 치운다.

# 짧은 판정 줄(A && ok || fail)과 source 한 lib.sh 의 전역 변수, 따옴표 안의 ~ 비교는 의도한 것이다.
# shellcheck disable=SC1091,SC2015,SC2034,SC2088

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/runner-lib-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

ok() { echo "ok   $1"; }
fail() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }
has() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else fail "$3"; printf '%s\n' "$1" | sed 's/^/     | /'; fi; }
lacks() { if grep -qF -- "$2" <<<"$1"; then fail "$3"; printf '%s\n' "$1" | sed 's/^/     | /'; else ok "$3"; fi; }

# --- lib.sh 단위 검사 ---------------------------------------------------------
(
  # shellcheck source=lib.sh
  source "$HERE/lib.sh"
  HOME="$TMP/home"
  ISSUE=44 STAMP=20261022T000000

  WT_PATH=""
  out="$(resume_hint)"
  lacks "$out" "cd " "워크트리가 없으면 이어 하기에 cd 가 없다"
  lacks "$out" "워크트리 없음" "워크트리가 없으면 자리 표시자가 없다"
  has "$out" "**이어 하기**: 이 Mac 에서 \`pnpm wt:pane 44\`." "워크트리가 없으면 wt:pane 만 안내한다"

  WT_PATH="$HOME/.herdr/worktrees/beside-pet/prd-44"
  out="$(resume_hint)"
  has "$out" "또는 \`cd ~/.herdr/worktrees/beside-pet/prd-44 && HARNESS_IMPL=44 claude" "워크트리가 있으면 cd ~/… 로 이어 한다"
  lacks "$out" "$HOME" "이어 하기에 홈 경로가 드러나지 않는다"

  [ "$(shown "$HOME/x/y")" = "~/x/y" ] && ok "shown 이 홈을 ~ 로 가린다" || fail "shown 이 홈을 ~ 로 가린다"
  [ "$(shown "/opt/x")" = "/opt/x" ] && ok "shown 이 홈 밖 경로는 그대로 둔다" || fail "shown 이 홈 밖 경로는 그대로 둔다"
  [ "$(mask_home "a $HOME/b c $HOME/d")" = "a ~/b c ~/d" ] && ok "mask_home 이 글 안의 홈을 모두 가린다" || fail "mask_home 이 글 안의 홈을 모두 가린다"

  WT_PATH=""
  out="$(blocked_comment "이유 한 줄." "첫째" "둘째")"
  [ "$(sed -n 1p <<<"$out")" = "### 러너: 막혔습니다 (#44)" ] && ok "막힘 댓글의 머리말" || fail "막힘 댓글의 머리말: $(sed -n 1p <<<"$out")"
  [ "$(sed -n 2,3p <<<"$out")" = $'\n이유 한 줄.' ] && ok "막힘 댓글의 이유 줄" || fail "막힘 댓글의 이유 줄"
  has "$out" $'- 첫째\n- 둘째' "막힘 댓글의 목록 줄"
  has "$out" "**이어 하기**" "막힘 댓글 끝에 이어 하기"

  unset GITHUB_STEP_SUMMARY
  summary_blocked "x" && ok "GITHUB_STEP_SUMMARY 가 없으면 요약을 건너뛴다" || fail "GITHUB_STEP_SUMMARY 가 없으면 요약을 건너뛴다"

  export GITHUB_STEP_SUMMARY="$TMP/summary.md"
  WT_PATH="$HOME/wt/prd-44"
  summary_blocked "막힌 이유." "목록 $HOME/a"
  summary_ready abc123
  summary_broken 77 "git -C $HOME/repo pull" 128
  s="$(cat "$GITHUB_STEP_SUMMARY")"
  has "$s" "막힘: 막힌 이유." "요약: 막힘 줄"
  has "$s" "**이어 하기**" "요약: 막힘에 이어 하기"
  has "$s" "review:ready, 커밋 \`abc123\`" "요약: 성공 줄"
  has "$s" "고장: implement.sh 77 행, 명령 \`git -C ~/repo pull\`" "요약: 고장 줄(홈 가림)"
  lacks "$s" "$HOME" "요약에 홈 경로가 없다"
  exit "$FAILS"
) || FAILS=$((FAILS + $?))

# --- implement.sh 종료 코드 ---------------------------------------------------
# 가짜 HOME 아래에 main 브랜치의 레포와 그 원격(bare)을 만든다. 원장 내용만 바꿔 가며 implement.sh 를 돌린다.
FAKE_HOME="$TMP/home"
BIN="$TMP/bin"; CALLS="$TMP/calls"
mkdir -p "$FAKE_HOME" "$BIN"
cat > "$BIN/pnpm" <<'STUB'
#!/usr/bin/env bash
# issue:comment 는 본문 파일을 남기고, 나머지는 인자만 남긴다. 모두 성공한다.
echo "pnpm $*" >> "$CALLS"
if [ "${2:-}" = issue:comment ]; then cat "$5" >> "$CALLS.comments"; echo "---" >> "$CALLS.comments"; fi
exit 0
STUB
cat > "$BIN/gh" <<'STUB'
#!/usr/bin/env bash
echo "gh $*" >> "$CALLS"
exit 0
STUB
chmod +x "$BIN/pnpm" "$BIN/gh"

REPO="$FAKE_HOME/repo"
git init -q --bare -b main "$TMP/remote.git"
git init -q -b main "$REPO"
git -C "$REPO" remote add origin "$TMP/remote.git"
mkdir -p "$REPO/docs/ledger"
echo '{"repo":"example/runner-test"}' > "$REPO/project.config.json"
printf '/outputs/\n' > "$REPO/.gitignore"

run_case() { # <원장 내용> → 종료 코드를 RC 에, 요약을 SUM 에, 댓글을 COMMENTS 에
  rm -f "$CALLS" "$CALLS.comments" "$TMP/sum.md"
  printf '%s' "$1" > "$REPO/docs/ledger/99.json"
  git -C "$REPO" add -A >/dev/null
  git -C "$REPO" -c user.name=t -c user.email=t@example.invalid commit -qm case >/dev/null
  git -C "$REPO" push -q -u origin main >/dev/null 2>&1
  HOME="$FAKE_HOME" PATH="$BIN:$PATH" CALLS="$CALLS" BESIDE_PET_REPO="$REPO" GITHUB_STEP_SUMMARY="$TMP/sum.md" \
    bash "$HERE/implement.sh" 99 > "$TMP/run.log" 2>&1 < /dev/null
  RC=$?
  sleep 0.2 # tee 가 남은 출력을 다 쓰도록
  SUM="$(cat "$TMP/sum.md" 2>/dev/null || true)"
  COMMENTS="$(cat "$CALLS.comments" 2>/dev/null || true)"
}

run_case '{"tasks":[{"id":"S1","status":"needs_spec"}]}'
[ "$RC" = 0 ] && ok "막힘(needs_spec)은 종료 코드 0" || { fail "막힘(needs_spec)은 종료 코드 0 (실제 $RC)"; sed 's/^/     | /' "$TMP/run.log"; }
has "$SUM" "막힘: 검증 방법이 정해지지 않은 작업(\`needs_spec\`)이 있습니다: S1." "막힘 요약에 이유"
lacks "$SUM" "$FAKE_HOME" "막힘 요약에 홈 경로가 없다"
has "$COMMENTS" "### 러너: 막혔습니다 (#99)" "막힘 댓글을 단다"
lacks "$COMMENTS" "cd " "원장에서 막히면 이어 하기에 cd 가 없다"
grep -qF -- "--add run:blocked" "$CALLS" && ok "막힘에 run:blocked 를 붙인다" || fail "막힘에 run:blocked 를 붙인다"

run_case 'not json'
[ "$RC" = 1 ] && ok "고장(원장 JSON 깨짐)은 종료 코드 1" || { fail "고장(원장 JSON 깨짐)은 종료 코드 1 (실제 $RC)"; sed 's/^/     | /' "$TMP/run.log"; }
has "$SUM" "고장: implement.sh " "고장 요약에 행 번호"
lacks "$SUM" "막힘:" "고장 요약에 막힘 줄이 없다"
[ "$(grep -c '^### 러너: 막혔습니다' <<<"$COMMENTS")" = 1 ] && ok "고장 댓글은 하나(하위 셸이 따로 달지 않는다)" || fail "고장 댓글은 하나 (실제 $(grep -c '^### 러너: 막혔습니다' <<<"$COMMENTS"))"
has "$COMMENTS" "러너 스크립트가 실패했습니다" "고장 댓글의 이유"

echo
if [ "$FAILS" -gt 0 ]; then echo "lib.test.sh: 실패 $FAILS"; exit 1; fi
echo "lib.test.sh: 모두 통과"
