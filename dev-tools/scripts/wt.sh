#!/usr/bin/env bash
# PRD 하나의 워크트리와 구현 pane 을 다룬다.
#
#   dev-tools/scripts/wt.sh create <이슈>   # prd/<이슈> 브랜치의 워크트리를 만든다 (herdr 가 있으면 workspace 로 연다)
#   dev-tools/scripts/wt.sh pane <이슈>     # 현재 pane 오른쪽에 워크트리 pane 을 열고 Claude 에게 /implement-prd 를 맡긴다 (herdr 필요)
#   dev-tools/scripts/wt.sh finish <이슈>   # 워크트리의 브랜치를 main 에 fast-forward 로 합치고 푸시한다
#   dev-tools/scripts/wt.sh remove <이슈>   # 워크트리, workspace, 브랜치, 구현 pane 을 치운다
#   dev-tools/scripts/wt.sh status          # 워크트리 목록
#
# herdr 는 선택이다. herdr 가 있으면 워크트리를 herdr workspace 로 열고 구현 pane 을 띄운다. herdr 가 없으면
# git worktree 만 쓰고, pane 대신 새 터미널에서 돌릴 명령을 알려 준다.
# 워크트리는 `<워크트리 뿌리>/<프로젝트 이름>/prd-<이슈>` 에 둔다. 뿌리는 환경 변수 WORKTREE_ROOT, 없으면 herdr 가
# 있을 때 `~/.herdr/worktrees`, 없을 때 `~/worktrees` 다. 프로젝트 이름은 project.config.json 의 name 이다.
# gitignore 된 로컬 폴더(data, outputs, docs/prd, docs/research, .env)는 본 체크아웃의 것을 심볼릭 링크로 같이 쓴다.
# 같은 DB, 같은 PRD 캐시를 보게 하려는 것이다. 빌드 폴더는 같이 쓰지 않고 워크트리마다 따로 갖는다.

set -euo pipefail

# 본 체크아웃(main). 워크트리 안에서 돌려도 본 체크아웃을 가리키게 git 의 공용 디렉터리로 잡는다.
REPO_ROOT="$(cd "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
SHARED_LOCAL=(data outputs docs/prd docs/research .env)
# 구현 세션임을 알리는 환경 변수. implement-prd 스킬이 읽는다.
IMPL_ENV="HARNESS_IMPL"

usage() {
  sed -n '2,9p' "$0" >&2
  exit 2
}

has_herdr() { command -v herdr >/dev/null 2>&1; }

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

project_name() {
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$REPO_ROOT/project.config.json"
}

worktree_path() {
  local root
  if [ -n "${WORKTREE_ROOT:-}" ]; then
    root="$WORKTREE_ROOT"
  elif has_herdr; then
    root="$HOME/.herdr/worktrees"
  else
    root="$HOME/worktrees"
  fi
  echo "$root/$(project_name)/prd-$1"
}

branch_of() { echo "prd/$1"; }

# 브랜치의 (경로, herdr workspace id). 없으면 빈 출력. herdr 가 없으면 workspace id 는 늘 빈 줄이다.
find_wt() {
  if has_herdr; then
    herdr worktree list --cwd "$REPO_ROOT" | BR="$(branch_of "$1")" python3 -c 'import json,os,sys
for w in json.load(sys.stdin)["result"]["worktrees"]:
    if w["branch"] == os.environ["BR"]:
        print(w["path"]); print(w.get("open_workspace_id") or ""); break'
  else
    git -C "$REPO_ROOT" worktree list --porcelain | BR="refs/heads/$(branch_of "$1")" python3 -c 'import os,sys
path=None
for line in sys.stdin.read().splitlines():
    if line.startswith("worktree "):
        path=line[len("worktree "):]
    elif line == "branch " + os.environ["BR"]:
        print(path); print(""); break'
  fi
}

# 현재 pane. herdr 가 넣어 준 id 가 있으면 그것, 없으면 포커스된 pane.
caller_pane() {
  if [ -n "${HERDR_PANE_ID:-}" ]; then echo "--pane" "$HERDR_PANE_ID"; else echo "--current"; fi
}

link_shared() {
  local wt="$1" item src dst exclude
  # .gitignore 의 `data/` 같은 규칙은 디렉터리만 가리키고 심볼릭 링크는 못 가린다.
  # 링크 이름을 레포의 로컬 exclude 에 적어 워크트리가 깨끗하게 보이게 한다.
  exclude="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
  mkdir -p "$(dirname "$exclude")"
  for item in "${SHARED_LOCAL[@]}"; do
    src="$REPO_ROOT/$item"; dst="$wt/$item"
    [ -e "$src" ] || continue
    grep -qx "/$item" "$exclude" 2>/dev/null || echo "/$item" >> "$exclude"
    [ -e "$dst" ] || [ -L "$dst" ] && continue
    mkdir -p "$(dirname "$dst")"
    ln -s "$src" "$dst"
  done
}

# pane 의 셸이 프롬프트에 섰는가. 앞에 선 프로세스가 셸 하나뿐이면 준비된 것으로 본다.
pane_shell_ready() {
  herdr pane process-info --pane "$1" 2>/dev/null | python3 -c 'import json,sys
p=json.load(sys.stdin)["result"]["process_info"]
shell=p.get("shell_pid"); fg=p.get("foreground_processes") or []
ok=shell is not None and p.get("foreground_process_group_id")==shell and all(x.get("pid")==shell for x in fg)
sys.exit(0 if ok else 1)' 2>/dev/null
}

# 새 pane 의 셸이 준비될 때까지 기다렸다가(0.5초 간격, 최대 20번) agent 를 띄운다.
# 셸이 아직 바쁘다는 agent_pane_busy 는 다시 시도하고, 다른 실패나 시도를 다 쓰면 1 을 돌려준다.
start_agent_when_ready() {
  local agent="$1" pane="$2" i err
  for ((i = 0; i < 20; i++)); do
    pane_shell_ready "$pane" && break
    sleep 0.5
  done
  for ((i = 0; i < 20; i++)); do
    if err="$(herdr agent start "$agent" --kind claude --pane "$pane" --timeout 60000 2>&1 >/dev/null)"; then
      return 0
    fi
    case "$err" in
      *agent_pane_busy*) sleep 0.5 ;;
      *) echo "$err" >&2; return 1 ;;
    esac
  done
  echo "pane 의 셸이 준비되지 않았습니다(agent_pane_busy): $pane" >&2
  return 1
}

# 워크트리 안의 무시되는 파일 가운데 소스 디렉터리 아래의 것. 빌드 산출물과 node_modules 는 뺀다.
# 워크트리를 지우면 함께 사라지므로, 커밋되지 않은 손으로 쓴 파일이 없는지 치우기 전에 본다.
ignored_source_files() {
  git -C "$1" ls-files --others --ignored --exclude-standard \
    | grep -E '^(apps|packages|dev-tools)/' \
    | grep -Ev '(^|/)(target|dist|build|\.turbo|node_modules)/' || true
}

cmd_create() {
  local issue="$1" branch; branch="$(branch_of "$issue")"
  [ -f "$REPO_ROOT/docs/ledger/$issue.json" ] || {
    echo "원장이 없습니다: docs/ledger/$issue.json. 먼저 pnpm ledger:new 로 만들고 커밋하세요" >&2; exit 1; }
  local found; found="$(find_wt "$issue")"
  if [ -n "$found" ]; then
    echo "이미 있습니다: $(echo "$found" | head -1)"; return 0
  fi
  local title; title="$(json 'd["title"]' < "$REPO_ROOT/docs/ledger/$issue.json")"
  local wt_path; wt_path="$(worktree_path "$issue")"
  local path ws=""
  if has_herdr; then
    local out; out="$(herdr worktree create --cwd "$REPO_ROOT" --branch "$branch" --base main --path "$wt_path" --label "#$issue $title" --no-focus)"
    path="$(printf '%s' "$out" | json 'd["result"]["worktree"]["path"]')"
    ws="$(printf '%s' "$out" | json 'd["result"]["workspace"]["workspace_id"]')"
  else
    mkdir -p "$(dirname "$wt_path")"
    git -C "$REPO_ROOT" worktree add -b "$branch" "$wt_path" main >/dev/null
    path="$wt_path"
  fi
  link_shared "$path"
  (cd "$path" && pnpm install --prefer-offline --silent)
  echo "워크트리: $path"
  echo "브랜치: $branch"
  if [ -n "$ws" ]; then echo "workspace: $ws"; fi
}

cmd_pane() {
  local issue="$1"
  local found; found="$(find_wt "$issue")"
  if [ -z "$found" ]; then
    cmd_create "$issue" >/dev/null
    found="$(find_wt "$issue")"
  fi
  local path; path="$(echo "$found" | head -1)"
  if ! has_herdr; then
    echo "herdr 가 없어 pane 을 열지 않았습니다. 새 터미널에서 구현 세션을 띄웁니다:" >&2
    echo "  cd $(printf '%q' "$path") && $IMPL_ENV=$issue claude '/implement-prd $issue'" >&2
    exit 1
  fi
  local agent="impl-$issue"
  if herdr agent get "$agent" >/dev/null 2>&1; then
    echo "이미 일하고 있습니다: agent $agent"; return 0
  fi
  # shellcheck disable=SC2046
  local out; out="$(herdr pane split $(caller_pane) --direction right --ratio 0.5 --cwd "$path" --env "$IMPL_ENV=$issue" --no-focus)"
  local pane; pane="$(printf '%s' "$out" | json 'd["result"]["pane"]["pane_id"]')"
  herdr pane rename "$pane" "impl #$issue" >/dev/null 2>&1 || true
  if ! start_agent_when_ready "$agent" "$pane"; then
    herdr pane close "$pane" >/dev/null 2>&1 || true
    echo "구현 pane 에서 agent 를 띄우지 못해 pane 을 닫았습니다: $pane" >&2
    exit 1
  fi
  herdr agent prompt "$agent" "/implement-prd $issue" >/dev/null
  echo "구현 pane: $pane"
  echo "agent: $agent"
  echo "워크트리: $path"
}

cmd_finish() {
  local issue="$1" branch; branch="$(branch_of "$issue")"
  local found; found="$(find_wt "$issue")"
  [ -n "$found" ] || { echo "워크트리가 없습니다: $branch" >&2; exit 1; }
  local path; path="$(echo "$found" | head -1)"
  [ -z "$(git -C "$path" status --porcelain)" ] || { echo "워크트리에 커밋하지 않은 변경이 있습니다" >&2; exit 1; }
  [ -z "$(git -C "$REPO_ROOT" status --porcelain)" ] || { echo "본 체크아웃(main)에 커밋하지 않은 변경이 있습니다" >&2; exit 1; }
  [ "$(git -C "$REPO_ROOT" branch --show-current)" = main ] || { echo "본 체크아웃이 main 이 아닙니다" >&2; exit 1; }
  git -C "$path" rebase main
  git -C "$REPO_ROOT" merge --ff-only "$branch"
  if git -C "$REPO_ROOT" remote get-url origin >/dev/null 2>&1; then
    git -C "$REPO_ROOT" push
    echo "main 에 합치고 푸시했습니다: $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  else
    echo "main 에 합쳤습니다: $(git -C "$REPO_ROOT" rev-parse --short HEAD). origin 원격이 없어 푸시하지 않았습니다" >&2
  fi
  echo "치우려면: pnpm wt:remove $issue"
}

cmd_remove() {
  local issue="$1" branch; branch="$(branch_of "$issue")"
  local found; found="$(find_wt "$issue")"
  local path=""
  if [ -n "$found" ]; then
    path="$(echo "$found" | head -1)"
    local lost; lost="$(ignored_source_files "$path")"
    if [ -n "$lost" ]; then
      echo "워크트리에 git 이 무시하는 소스 파일이 있어 멈춥니다. 지우면 함께 사라집니다:" >&2
      echo "$lost" | sed 's/^/  /' >&2
      echo "옮기거나 지운 뒤 다시 실행하세요" >&2
      exit 1
    fi
  fi
  local agent="impl-$issue"
  if has_herdr && herdr agent get "$agent" >/dev/null 2>&1; then
    local pane; pane="$(herdr agent get "$agent" | json 'd["result"]["agent"]["pane_id"]' 2>/dev/null || true)"
    [ -n "$pane" ] && herdr pane close "$pane" >/dev/null 2>&1 || true
  fi
  if [ -n "$found" ]; then
    local ws; ws="$(echo "$found" | sed -n 2p)"
    # 위의 확인을 통과했으니 남은 무시되는 파일은 빌드 산출물과 링크뿐이다. --force 로 함께 지운다.
    if [ -n "$ws" ]; then
      herdr worktree remove --workspace "$ws" --force >/dev/null
    else
      git -C "$REPO_ROOT" worktree remove --force "$path"
    fi
  fi
  git -C "$REPO_ROOT" worktree prune
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$REPO_ROOT" branch -d "$branch" || echo "브랜치 $branch 가 main 에 합쳐지지 않아 남겨 둡니다 (-D 로 직접 지우세요)" >&2
  fi
  echo "치웠습니다: $branch"
}

cmd_status() {
  if has_herdr; then
    herdr worktree list --cwd "$REPO_ROOT" | python3 -c 'import json,sys
for w in json.load(sys.stdin)["result"]["worktrees"]:
    print(f'"'"'{w["branch"]:<16} {w.get("open_workspace_id") or "-":<4} {w["path"]}'"'"')'
  else
    git -C "$REPO_ROOT" worktree list
  fi
}

cmd="${1:-}"; issue="${2:-}"
case "$cmd" in
  create|pane|finish|remove) [[ "$issue" =~ ^[0-9]+$ ]] || usage; "cmd_$cmd" "$issue" ;;
  status) cmd_status ;;
  *) usage ;;
esac
