---
id: ADR-0032
date: 2026-10-21
status: accepted
tags: [harness, automation, github, runner, process]
related: [ADR-0024, ADR-0029]
---
# 구현 자동화는 이 Mac 의 self-hosted 러너가 이슈 라벨을 받아 돌리고, 결과는 이슈 댓글이며, 이슈는 사람이 닫는다

## 맥락

PRD 를 승인한 뒤의 일(워크트리, 구현 세션, 마감, QA 보고서)은 팀장이 `pnpm wt:pane` 으로 열고 사람이 pane 을 지켜봐야 했다. 운영 화면의 개발노트(#33)에 "구현 시작" 버튼이 생겨 라벨 `run:implement` 를 붙일 수 있게 됐으므로, 그 라벨을 받아 구현을 돌리는 자리가 필요하다(#34). 모델은 이 머신의 Claude Code 구독으로 돌고(Anthropic API 는 제품 런타임만), 워크트리와 QA 는 이 머신의 sandbox 와 로컬 production 복사본을 쓴다.

## 결정

1. **자리는 이 Mac 의 GitHub Actions self-hosted 러너다.** 워크플로 `.github/workflows/implement.yml` 이 `issues: labeled` 중 `run:implement`·`run:again` 에만 깨어나 `runs-on: [self-hosted, beside-pet-mac]` 로 `dev-tools/scripts/runner/implement.sh <이슈>` 를 돌린다. 클라우드 러너는 쓰지 않는다. 구독, 로컬 DB, herdr 워크트리가 모두 이 머신에 있다.
2. **트리거는 라벨, 결과는 댓글, 닫는 것은 사람이다.** 러너는 시작 댓글 하나와 끝 댓글 하나(원장 실측, `pnpm test`, QA 항목과 스크린샷 경로, 커밋 sha)를 남기고 라벨 `review:ready` 를 붙이며 `run:implement`·`run:again` 은 뗀다. 보드 카드는 옮기지 않는다(보드 2 의 Status 는 Todo/In Progress/Done 뿐). 사람이 댓글을 보고 이슈를 닫으면 보드 자동화가 Done 으로 옮긴다.
3. **막히면 사람에게.** `parked` 작업, QA `확인 불가`, 분류기가 막은 명령(`permission_denials`), 사람의 응답이 필요한 프롬프트는 러너가 풀지 않는다. 무엇이 막혔는지 댓글에 적고 `run:blocked` 를 붙인 뒤 멈춘다. 사람이 pane 에서 이어 한다. 러너 세션은 `HARNESS_RUNNER=1` 로 구분하고 묻는 대신 멈춘다.
4. **동시에 하나.** 워크플로의 `concurrency: implement` 로 한 번에 하나만 돈다(CPU 와 구독 한도). 같은 이슈를 사람이 pane 으로 진행 중이면(원장에 `doing`) 러너는 "누가 하고 있다"고 적고 멈춘다.
5. **러너 등록과 토큰은 사용자의 일이다.** 계정에 러너를 등록하는 것은 클라우드 자원과 같은 취급이다. `GH_TOKEN` 은 `JadenKimDev` 의 fine-grained 토큰(issues·projects 쓰기)을 사용자가 발급해 러너 환경에 두고, 에이전트는 만들지도 읽지도 않는다.
6. **지키는 선은 그대로.** 러너도 `.env` 값과 DB 본문을 읽지 않고, production 에 닿지 않는다(`deploy:prod` 는 사람이). 워크트리는 사람이 이슈를 닫은 뒤 치운다.

## 버린 것

| 대안 | 버린 이유 |
|---|---|
| GitHub 의 클라우드 러너 | 구독 세션, sandbox DB, 로컬 production 복사본, herdr 가 이 머신에만 있다. API 키로 돌리면 "개발은 구독으로"의 선을 넘는다 |
| 러너가 이슈를 닫음 | 검수와 마감 판단은 사람의 것이다. 댓글과 `review:ready` 까지만 |
| 보드에 "In review" 열을 두기 | 보드 2 의 선택지가 셋뿐이고, 라벨 하나가 같은 뜻을 전한다. 열을 더하는 것은 사용자가 정한다 |
| 막힌 프롬프트를 러너가 자동 승인 | 사람이 정하도록 둔 권한 프롬프트를 자동으로 누르는 것은 권한의 뜻을 없앤다 |
| 동시에 여럿 | 이 Mac 의 CPU 와 구독 한도, 공용 sandbox DB 의 마이그레이션 충돌 |

## 결과

- 사용자가 러너를 등록하기 전에는 라벨을 붙여도 아무 일이 없다. 절차는 `dev-tools/scripts/runner/README.md`.
- 루트 `CLAUDE.md` "작업 흐름"에 라벨로 구현을 시킬 수 있고 결과는 이슈 댓글이라는 두 줄을 둔다. `implement-prd` 0단계에 러너 세션의 분기를 둔다.
- 라벨 넷(`run:implement`, `run:again`, `run:blocked`, `review:ready`)이 레포에 생긴다.

## 근거

- PRD #34 (개발 자동화), PRD #33 (운영 화면의 "구현 시작" 버튼).
- 2026-10-21 사용자 지시: 개발 작업은 API 가 아니라 Claude Code 구독으로.
