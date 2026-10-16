#!/usr/bin/env bash
# 현재 herdr pane 오른쪽에 PRD 초안을 vi 로 연다.
#
#   dev-tools/scripts/prd-pane.sh docs/prd/<파일>.md
#
# 초안을 쓰는 동안 사용자가 옆에서 읽고 고칠 수 있게 한다. herdr 는 선택이다. herdr 가 없으면 pane 을 열지 않고
# 파일 경로만 알린 뒤 1 로 끝난다(부른 쪽은 초안을 대화에 보여 준다).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
file="${1:-}"
[ -n "$file" ] || { echo "사용법: dev-tools/scripts/prd-pane.sh docs/prd/<파일>.md" >&2; exit 2; }
case "$file" in /*) ;; *) file="$REPO_ROOT/$file" ;; esac
[ -f "$file" ] || { echo "파일이 없습니다: $file" >&2; exit 1; }
command -v herdr >/dev/null || {
  echo "herdr 가 없어 pane 을 열지 않았습니다. 편집기로 직접 여세요: $file" >&2
  exit 1
}

if [ -n "${HERDR_PANE_ID:-}" ]; then
  target=(--pane "$HERDR_PANE_ID")
else
  target=(--current)
fi

result="$(herdr pane split "${target[@]}" --direction right --ratio 0.5 --cwd "$REPO_ROOT")"
pane_id="$(printf '%s' "$result" | python3 -c 'import json,sys
def find(o):
    if isinstance(o, dict):
        if "pane_id" in o: return o["pane_id"]
        for v in o.values():
            r = find(v)
            if r: return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r: return r
print(find(json.load(sys.stdin)) or "")')"
[ -n "$pane_id" ] || { echo "새 pane id 를 읽지 못했습니다: $result" >&2; exit 1; }

herdr pane rename "$pane_id" "PRD" >/dev/null 2>&1 || true
herdr pane run "$pane_id" "vi $(printf '%q' "$file")" >/dev/null
echo "PRD pane: $pane_id"
