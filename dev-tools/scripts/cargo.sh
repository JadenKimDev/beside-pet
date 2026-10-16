#!/usr/bin/env bash
# cargo 를 찾아 받은 인자 그대로 돌린다. 이 머신의 cargo 는 PATH 에 없을 수 있어(rustup 을 brew 로 깔면
# /opt/homebrew/opt/rustup/bin 에만 있다) package.json 과 원장의 검증 명령은 이 래퍼를 쓴다.
# 찾는 순서: PATH, ~/.cargo/bin, /opt/homebrew/opt/rustup/bin.

set -euo pipefail

if command -v cargo >/dev/null 2>&1; then
  exec cargo "$@"
fi

for dir in "$HOME/.cargo/bin" /opt/homebrew/opt/rustup/bin; do
  if [ -x "$dir/cargo" ]; then
    # rustup 의 프록시(cargo)가 rustc, clippy-driver 를 같은 자리에서 찾게 PATH 에도 더한다.
    export PATH="$dir:$PATH"
    exec "$dir/cargo" "$@"
  fi
done

echo "cargo 를 찾지 못했다: PATH, ~/.cargo/bin, /opt/homebrew/opt/rustup/bin 에 없다. rustup 으로 설치한다." >&2
exit 127
