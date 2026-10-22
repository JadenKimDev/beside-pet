---
id: ADR-0035
date: 2026-10-22
status: accepted
tags: [backoffice, harness, automation, claude-code, prd, process, security]
related: [ADR-0024, ADR-0029, ADR-0032]
---
# 운영 화면의 "PRD 쓰기"는 이 Mac 의 `claude -p` 를 구독으로 띄워 prd 스킬과 대화하고, 이슈로 올리는 것은 모델이 아니라 화면의 버튼이 닫힌 명령 목록을 돌린다

## 맥락

PRD 는 터미널의 팀장 세션(Claude Code)과 대화해 쓰고, 승인 뒤 팀장이 `prd:push`, `ledger:new`, 커밋과 푸시, `wt:create` 를 차례로 돌렸다. 개발노트(#33)와 self-hosted 러너(#34, ADR-0032)가 생기면서 "구현 시작" 뒤의 일은 화면에서 시킬 수 있게 됐지만, 그 앞의 PRD 작성은 여전히 터미널에서만 됐다. #40 은 같은 일을 운영 화면의 `/dev-notes/new` 에서 하게 한다.

모델을 어디서 부를지, 그리고 Next 의 Route Handler 가 로컬 프로세스를 띄우는 것을 허용할지가 결정할 일이다. 운영 화면은 이 머신에서만 뜬다(ADR-0024). 개발 중의 모델 호출은 Anthropic API 가 아니라 이 머신의 Claude Code 구독으로 한다는 원칙이 있고(2026-10-21 사용자 지시, ADR-0032 의 러너도 같은 구독), `claude -p` 가 Next 프로세스의 자식으로 떠서 구독으로 답하는 것은 #34 에서 확인했다.

## 결정

1. **모델은 이 Mac 의 `claude -p`(구독)다.** Route Handler 가 레포 루트에서 `claude -p --session-id <uuid> --output-format stream-json ... "/prd <메시지>"` 를 띄우고, 후속 메시지는 `--resume <uuid>` 로 같은 세션을 잇는다. prd 스킬이 그대로 PRD 의 품질을 정하므로 터미널에서 쓰는 것과 같은 결과가 나온다. API 키는 쓰지 않는다.
2. **Route Handler 가 띄우는 로컬 프로세스는 닫힌 목록이다.** `claude -p`, 작업 대장 CLI(`pnpm prd:push`, `pnpm ledger:new`, `pnpm wt:create`), 그 사이의 `git add`·`git commit`·`git push origin main` 뿐이다. 목록과 인자 조립은 `apps/backoffice/src/shared/claude/` 한 자리에 있다. 사용자의 글은 `claude -p` 의 인자 배열 원소 하나로만 가고 셸 문자열에 끼우지 않는다(`shell: false`). 올리기 명령의 인자는 `docs/prd/` 아래의 파일 이름과 이슈 번호(정수)뿐이다.
3. **파일 경로는 `docs/prd/` 아래만.** 초안 읽기와 올리기의 파일 인자는 basename 이 `[A-Za-z0-9._-]+\.md` 인 것만 받고 `..` 와 경로 구분자는 거른다. 레포 루트는 `project.config.json` 을 찾는 기존 방식으로 구한다.
4. **`claude -p` 의 권한은 좁힌다.** 읽기 도구와 `Write`·`Edit`, 그리고 `pnpm docs:search`, `pnpm ledger:outcomes`, `git log`, `ls` 의 Bash 만 `--allowedTools` 로 준다. `--append-system-prompt` 로 herdr pane 을 열지 말 것, 올리기 명령을 돌리지 말 것, 초안을 쓸 때마다 `PRD_DRAFT: docs/prd/<파일>.md` 한 줄을 적을 것을 알린다. 화면은 이 줄로 미리보기 파일을 안다.
5. **이슈로 올리는 것은 모델이 아니라 버튼이다.** 사용자가 초안을 보고 "이슈로 올리기"를 누르면 Route Handler 가 2 의 목록을 순서대로 돌리고 단계마다 결과를 흘린다. 실패한 단계에서 멈추고 되돌리지 않는다(이슈는 남고, 사람이 터미널에서 이어 한다). 승인은 사람의 것이라는 선(ADR-0032 의 "닫는 것은 사람")과 같다.
6. **자식 프로세스의 env 에서 중첩 세션 표지와 토큰을 뺀다.** `CLAUDECODE`, `CLAUDE_CODE_*`, `GITHUB_TOKEN` 을 넘기지 않는다. `prd:push` 의 `gh` 인증은 CLI 가 스스로 `JadenKimDev` 토큰을 고른다(루트 `CLAUDE.md` "계정").
7. **이 기능 때문에도 운영 화면은 이 머신 밖에 올리지 않는다.** Route Handler 가 로컬 프로세스를 띄우는 것은 운영 화면이 로그인한 운영자 한 사람의 머신에서만 뜬다는 전제(ADR-0024) 위에서만 안전하다. 올리려면 `app/api/prd-chat/` 을 빼야 한다. 관리자 확인은 기존 `isAdminRequest`(서버의 `/v1/auth/me`)다.
8. **세션 하나에 프로세스는 하나.** 답이 흐르는 동안 같은 세션에 보낸 메시지는 409 다. 러너(ADR-0032)와 구독을 나눠 쓰므로 겹치면 느려질 뿐 막지 않는다.

## 버린 것

| 대안 | 버린 이유 |
|---|---|
| Agent SDK 와 Anthropic API 키로 Next 안에서 모델을 부름 | API 는 종량제라 유한하고, "개발 작업은 구독으로"의 원칙에 어긋난다. prd 스킬과 레포의 `CLAUDE.md` 를 Claude Code 가 읽어 주는 것도 잃는다 |
| 터미널에서만 PRD 를 쓰는 지금 방식 유지 | 개발노트가 이미 "구현 시작"을 가졌는데 그 앞 단계만 터미널인 것이 흐름을 끊는다. 운영 화면이 이 머신 전용이라 로컬 프로세스를 띄울 수 있다 |
| 모델에게 `prd:push` 와 `git push`, `wt:create` 까지 맡김 | 승인은 사람이 한다. 모델이 원격에 쓰는 명령을 돌리면 틀린 초안이 이슈와 main 에 들어간다. 버튼이 닫힌 목록을 돌리는 것이 더 좁다 |
| 사용자의 글을 `claude -p` 의 stdin 으로 넘김 | 인자 배열 원소 하나로 넘기는 것과 안전성은 같고, `/prd <메시지>` 로 스킬을 부르는 모양이 더 단순하다. 바꿀 이유가 생기면 `spawnClaude` 한 자리만 고친다 |
| 운영 화면을 올릴 때 이 Route Handler 를 인증 뒤에 두고 남김 | 로그인한 관리자가 임의의 프롬프트로 이 머신의 프로세스를 띄울 수 있는 길이 바깥에 열린다. 올리는 날이 오면 뺀다 |

## 결과

- 개발노트 머리의 "PRD 쓰기" → `/dev-notes/new`. 왼쪽 채팅, 오른쪽 초안 미리보기(`docs/prd/<파일>.md`). "이슈로 올리기"가 `prd:push` → `ledger:new` → 원장 커밋 → `git push origin main` → `wt:create` 를 돌리고, 끝나면 Todo 열의 카드에서 "구현 시작"(ADR-0032)으로 이어진다.
- `claude` 를 찾지 못하거나 로그인되지 않으면 503 과 안내. 이어 할 길은 `apps/backoffice/README.md` "PRD 쓰기".
- 규칙은 `apps/backoffice/CLAUDE.md` 에 한 항목으로 둔다.

## 근거

- PRD #40 (`docs/prd/40-backoffice-prd-chat.md`).
- `claude -p` 가 Next 의 자식으로 구독으로 뜨는 것: #34 의 러너가 `claude -p` 로 구현 세션을 돌린 실측(2026-10-20, 등급 B).
- 개발 작업은 구독으로: 사용자 지시 2026-10-21. ADR-0032 결정 1 과 같은 근거.
