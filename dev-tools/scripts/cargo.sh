#!/usr/bin/env bash
# cargo 를 찾아 받은 인자 그대로 돌린다. 이 머신의 cargo 는 PATH 에 없을 수 있어(rustup 을 brew 로 깔면
# /opt/homebrew/opt/rustup/bin 에만 있다) package.json 과 원장의 검증 명령은 이 래퍼를 쓴다.
# 찾는 순서: PATH, ~/.cargo/bin, /opt/homebrew/opt/rustup/bin.
#
# 빌드 폴더(target/)는 두 가지를 더 한다.
# - 워크트리에서 돌려도 본 체크아웃의 target/ 하나를 같이 쓴다(CARGO_TARGET_DIR). 워크트리마다 7G 급이
#   생기는 것을 막는다. cargo 가 잠금으로 동시 빌드를 직렬화하므로 안전하다. 환경에 CARGO_TARGET_DIR 이
#   이미 있으면 그것을 따른다.
# - target/ 이 CARGO_TARGET_MAX_GB(기본 4)를 넘으면 돌리기 전에 `cargo clean` 으로 비운다. cargo 는 옛
#   버전의 산출물을 지우지 않고 옆에 쌓으므로(의존성, rustc, feature 가 바뀔 때마다 한 벌) 그대로 두면
#   끝없이 큰다. 2026-10-22 실측: 쌓인 7.5G 를 비우고 전부 다시 빌드(--all-targets)하는 데 20초, 1.9G.
#   cargo-sweep 의 stamp 방식은 지운 뒤 226개가 다시 컴파일돼 쓰지 않는다.

set -euo pipefail

CARGO=""
if command -v cargo >/dev/null 2>&1; then
  CARGO="$(command -v cargo)"
else
  for dir in "$HOME/.cargo/bin" /opt/homebrew/opt/rustup/bin; do
    if [ -x "$dir/cargo" ]; then
      # rustup 의 프록시(cargo)가 rustc, clippy-driver 를 같은 자리에서 찾게 PATH 에도 더한다.
      export PATH="$dir:$PATH"
      CARGO="$dir/cargo"
      break
    fi
  done
fi
if [ -z "$CARGO" ]; then
  echo "cargo 를 찾지 못했다: PATH, ~/.cargo/bin, /opt/homebrew/opt/rustup/bin 에 없다. rustup 으로 설치한다." >&2
  exit 127
fi

# --- 워크트리면 본 체크아웃의 target/ 을 쓴다 ---
if [ -z "${CARGO_TARGET_DIR:-}" ] && common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
  main_root="$(dirname "$common")"
  top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$top" ] && [ "$main_root" != "$top" ]; then
    export CARGO_TARGET_DIR="$main_root/target"
  fi
fi
target_dir="${CARGO_TARGET_DIR:-target}"

# --- 너무 크면 비운다 ---
max_gb="${CARGO_TARGET_MAX_GB:-4}"
if [ -d "$target_dir" ]; then
  used_kb="$(du -sk "$target_dir" 2>/dev/null | cut -f1)"
  if [ "${used_kb:-0}" -gt $((max_gb * 1024 * 1024)) ]; then
    echo "[cargo.sh] $target_dir 이 ${max_gb}G 를 넘어($((used_kb / 1024 / 1024))G) 비우고 다시 빌드한다" >&2
    "$CARGO" clean --target-dir "$target_dir" -q
  fi
fi

exec "$CARGO" "$@"
