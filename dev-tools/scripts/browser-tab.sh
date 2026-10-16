#!/usr/bin/env bash
# 터미널 브라우저를 herdr 의 따로 된 탭에서 연다. 지금 보고 있는 pane 은 나누지 않는다.
#
#   dev-tools/scripts/browser-tab.sh <주소>
#
# herdr 와 terminal-browser 가 있어야 한다(둘 다 선택 도구다. 없으면 이유를 말하고 1 로 끝난다).
# "browser" 탭이 없으면 만들고, 이미 있으면 그 탭의
# 브라우저를 주소로 옮긴다. 포커스는 옮기지 않는다. 마지막 줄에 브라우저의 키를 적는다:
# 이후의 조작은 `terminal-browser action --browser <키> -- <명령>` 으로 한다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="browser"
url="${1:-}"
[ -n "$url" ] || { echo "사용법: dev-tools/scripts/browser-tab.sh <주소>" >&2; exit 2; }
command -v herdr >/dev/null || { echo "herdr 가 없어 탭을 열 수 없습니다. 브라우저로 직접 여세요: $url" >&2; exit 1; }
command -v terminal-browser >/dev/null || { echo "terminal-browser 를 찾을 수 없습니다" >&2; exit 1; }

# "browser" 탭의 id. 없으면 빈 줄.
tab_id() {
  herdr tab list | LABEL="$LABEL" python3 -c 'import json,os,sys
tabs = json.load(sys.stdin)["result"]["tabs"]
print(next((t["tab_id"] for t in tabs if t["label"] == os.environ["LABEL"]), ""))'
}

# 그 탭에 떠 있는 브라우저의 키. 없으면 빈 줄. `terminal-browser ls` 는 "<키>  <탭>:<pane>" 으로 적는다.
browser_key() {
  terminal-browser ls --all 2>/dev/null | awk -v tab="$1:" 'index($2, tab) == 1 { print $1; exit }'
}

tab="$(tab_id)"
key=""
[ -n "$tab" ] && key="$(browser_key "$tab")"

if [ -n "$key" ]; then
  terminal-browser action --browser "$key" -- open "$url" >/dev/null
else
  # 브라우저가 닫힌 채 남은 탭은 버리고 새로 만든다.
  [ -n "$tab" ] && herdr tab close "$tab" >/dev/null
  created="$(herdr tab create --label "$LABEL" --cwd "$REPO_ROOT" --no-focus)"
  tab="$(printf '%s' "$created" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["tab"]["tab_id"])')"
  pane="$(printf '%s' "$created" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')"
  herdr pane run "$pane" "terminal-browser open $(printf '%q' "$url")" >/dev/null
  for _ in $(seq 1 20); do
    key="$(browser_key "$tab")"
    [ -n "$key" ] && break
    sleep 0.5
  done
  [ -n "$key" ] || { echo "브라우저가 뜨지 않았습니다 (탭 $tab)" >&2; exit 1; }
fi

echo "브라우저 탭: $tab ($LABEL)"
echo "$key"
