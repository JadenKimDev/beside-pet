---
id: DEV-2026-10-22-cargo-sweep-breaks-cache
date: 2026-10-22
tags: [harness, rust, build, disk]
related: [ADR-0037]
---
# cargo-sweep 의 stamp 방식으로 `target/` 을 정리하면 다음 빌드가 226개를 다시 컴파일했다. 비우고 전부 다시 빌드하는 쪽이 20초였다

## 맥락

`target/` 이 7.5G 까지 커서 "마지막 빌드와 그 전 빌드가 쓴 것만 남기자"는 안을 실측했다. cargo-sweep 0.8.0 의 `--stamp`(시각을 찍음) → 빌드 → `--file`(그 시각보다 오래된 파일 삭제)이 그 뜻에 가장 가까웠다.

## 해 본 것

1. `cargo build --all-targets` 로 모든 것을 fresh 로 만든 뒤(재컴파일 1개) `cargo sweep --time 1 --dry-run`: 1.46 GiB 를 지우겠다고 했다. 하루 안에 러너가 돌린 빌드가 많아 대부분이 살아남았다.
2. `cargo sweep --stamp` → `cargo build --all-targets`(0.09초, 전부 fresh) → `cargo sweep --file --dry-run`: 1.78 GiB. 실제로 지웠다.
3. 바로 다시 `cargo build --all-targets`: **226개를 다시 컴파일했다.** 지운 것 가운데 지금 빌드가 쓰는 파일이 있었다. fresh 인 결과물의 파일 시각을 cargo 가 모두 갱신하지는 않는 것으로 보인다(원인은 더 파지 않았다).
4. 비교로 `cargo clean`(12.9 GiB 삭제) 뒤 `cargo build --all-targets`: 20초, 1.9G. `incremental/` 디렉터리는 24개에서 7개로 줄었다. 나머지 17개는 옛 해시의 세션이었다.

## 결과

- stamp 방식은 캐시 보존을 보장하지 못했고, 보존해서 얻는 것도 20초였다. 쓰지 않는다. cargo-sweep 은 지웠다.
- `incremental/` 은 rustc 가 성공한 다음 빌드 때 옛 세션을 스스로 지우지만, 해시가 바뀐 디렉터리(feature, 플래그, 테스트 하네스 등)는 남는다. 1.6G 가 그것이었다.
- 결정은 ADR-0037: 크기 상한에서 통째로 비운다.
