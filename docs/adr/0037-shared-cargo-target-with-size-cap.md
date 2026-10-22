---
id: ADR-0037
date: 2026-10-22
status: accepted
tags: [harness, rust, build, disk, worktree, process]
related: [ADR-0032, DEV-2026-10-22-cargo-sweep-breaks-cache]
---
# Rust 의 `target/` 은 워크트리끼리 본 체크아웃의 것 하나를 같이 쓰고, 4G 를 넘으면 `cargo.sh` 가 통째로 비운다

## 맥락

이 레포는 PRD 마다 워크트리를 만들어 일하고, 러너(ADR-0032)도 워크트리에서 `cargo test` 를 돌린다. 빌드 폴더는 워크트리마다 따로였다. 2026-10-22 에 재 보니 레포 17G 가운데 `target/` 이 7.5G(`cargo clean` 이 지운 양은 12.9G)였고, 이슈 작업의 기록(러너 로그, QA 보고서, 원장)은 이슈 하나당 2~3M 에 그쳤다. 디스크를 먹는 것은 작업 기록이 아니라 빌드 캐시였다.

cargo 는 결과물을 크레이트 이름, 버전, feature, 프로파일, rustc 버전으로 만든 해시 이름으로 `target/debug/deps/` 에 두고, 이 가운데 하나라도 바뀌면 옛 파일을 지우지 않고 새 파일을 옆에 쌓는다. 의존성이나 rustc 를 올릴 때마다 한 벌이 더 생기므로 그대로 두면 끝없이 큰다. 여기에 워크트리마다 자기 `target/` 을 가지면 병렬 구현 셋이 각자 7G 급을 만든다. cargo 자체의 `target/` 정리는 아직 안정화되지 않았다(`-Z gc`, nightly).

## 결정

1. **워크트리는 본 체크아웃의 `target/` 을 쓴다.** `dev-tools/scripts/cargo.sh` 가 `git rev-parse --git-common-dir` 로 본 체크아웃을 찾아 `CARGO_TARGET_DIR` 을 거기로 둔다. 환경에 이미 있으면 그것을 따른다. cargo 는 같은 `target/` 안의 동시 빌드를 파일 잠금으로 직렬화하므로 안전하다. 레지스트리 크레이트의 결과물은 워크트리끼리 그대로 공유되고, 우리 크레이트(`beside-pet-server`)만 경로가 해시에 들어가 워크트리마다 따로 컴파일된다.
2. **`target/` 이 `CARGO_TARGET_MAX_GB`(기본 4)를 넘으면 돌리기 전에 `cargo clean` 으로 비운다.** 모든 cargo 호출(`pnpm test`, `pnpm dev`, 러너, 원장의 검증 명령)이 이 래퍼를 지나므로 사람도 러너도 따로 기억할 것이 없다.

## 버린 것

- **"마지막 빌드가 쓴 것만 남기기"(cargo-sweep).** 지문 기준의 정밀 정리는 캐시를 깨뜨렸다(DEV-2026-10-22-cargo-sweep-breaks-cache). 비우고 전부 다시 빌드하는 데 20초밖에 걸리지 않아, 정밀하게 남길 가치가 없었다.
- **30일 같은 기간 기준.** 기간 안의 빌드가 모두 살아남아 상한이 없다.
- **스킬이나 규칙으로 두기.** 모든 빌드 뒤에 빠짐없이 돌아야 하는 것은 에이전트가 떠올려 부르는 절차가 아니라 장치여야 한다.

## 결과

- 비우고 `cargo build --all-targets` 로 전부 다시 빌드: 20초, 1.9G(2026-10-22, 이 머신). 상한 4G 는 이 값의 두 배로, 의존성이 한 번 바뀌어도 바로 비우지 않을 만큼이다.
- 워크트리를 셋 띄워도 `target/` 은 한 벌이다.
- 바뀌는 것: 비운 직후의 첫 빌드가 20초 느리다. 두 워크트리가 동시에 빌드하면 한쪽이 잠금을 기다린다.

## 근거

- 실측 명령: `du -sh target`, `cargo clean`, `time cargo build --all-targets`, `cargo build --all-targets 2>&1 | grep -c Compiling`(재컴파일 수).
- 커밋 42033ef(`dev-tools/scripts/cargo.sh`).
