# Beside Pet repository guide

Beside Pet 는 반려동물을 떠나보낸 보호자를 위한 AI 감정 지원(emotional support) 웹서비스다. 사용자에게 보이는 글에서는 상담, 치료라고 부르지 않는다(ADR-0003). 사용자 본인의 제품이고, 같은 레포에서 실제 제품과 포트폴리오용 구현을 함께 관리한다. 모바일 앱은 접었고 웹으로만 운영한다.

모노레포다(pnpm 워크스페이스, Node.js 24). 대화 웹(`apps/web`)은 Next.js, 서버(`apps/server`)는 Rust(axum, sqlx)와 PostgreSQL 이고, TS(NestJS) API 는 2026-10-16 에 지웠다(ADR-0019). AI 모델은 Claude Haiku 5.5 다. production 은 Anthropic API, 개발·실측은 이 Mac 의 Claude Code 구독(`claude-code` 공급자)이다(ADR-0038). 운영 화면(`apps/backoffice`)은 Next.js 이고 이 머신에서만 띄우며 서버의 관리자 API 만 부른다(ADR-0024). 포트폴리오용 자료(`showcase/`)는 대화 웹의 공개 화면 `/showcase` 가 보인다(ADR-0029).

조사 근거는 `docs/research/` 에 있다(로컬 전용, gitignore. 커밋하지 않는다). 제품과 구조의 결정과 그 이유는 `docs/adr/`, 해 봤는데 안 된 일은 `docs/devlog/` 에 적는다(추적 대상, 안내는 `docs/adr/README.md`). 매번 읽지 않고, PRD 를 쓰기 전과 결정이 갈릴 때 `pnpm docs:search` 로 찾아 나온 것만 읽는다.

## 제품 원칙

- 실제 제품은 `apps/` 에, 포트폴리오로 보여 줄 자료(지어낸 대화의 스크린샷과 전사, 개발 기록)는 `showcase/` 에 둔다. 제품 앱에 데모나 포트폴리오 전용 분기를 넣지 않는다. 예외는 그 자료를 그리기만 하는 공개 화면 `/showcase` 하나다(ADR-0029). 개발 기록(`showcase/dev-notes.json`)은 이슈를 마감할 때 사용자의 말로 손으로 쓰고, GitHub 를 읽어 만들지 않는다.
- 서버 엔드포인트의 겉(경로, 요청과 응답의 모양, 상태 코드, 오류 문구, 환경 변수 이름)은 옛 TS API 의 것을 그대로 둔다(ADR-0015). 겉을 바꾸고 싶은 것은 웹과 함께 따로 PRD 로 다룬다.
- 위기 발화(자해, 자살)를 감지해 안내로 잇는 흐름은 약하게 만들지 않는다. 바꿀 때는 감지 테스트를 먼저 쓴다.

## 지키는 선

- 실행 환경은 production 과 sandbox 둘이다(ADR-0021). production 은 실제로 쓰는 환경이고 AWS 의 EC2 한 대(앞에 CloudFront, 주소는 CloudFront 기본 도메인이고 커스텀 도메인은 쓰지 않는다. besidepet.com 은 상표 문제로 쓰지 않는다)에 있다(ADR-0023). `pnpm prod:up` 은 같은 compose 를 이 머신에서 미리 돌려 보는 것이고, 배포는 `pnpm deploy:prod` 다. sandbox 는 개발, 테스트, 실측용이고 `pnpm dev`, `pnpm test`, `pnpm chat:eval` 이 보는 DB 다.
- 실제 사용자의 데이터(상담 내용, 반려동물 정보, 계정)는 sandbox DB 와 테스트 픽스처에 넣지 않는다. sandbox 에 들어가는 production 의 복사본은 `pnpm sandbox:reset` 이 본문을 자리 표시자로 바꾼 것뿐이고, 바꾸는 칸의 목록은 `infra/docker/scripts/sandbox-scrub.sql` 한 곳에 둔다. 사용자가 쓰는 본문 칸을 더하면 그 목록에도 더한다. 픽스처는 지어낸 값으로 만든다.
- 클라우드의 운영 자원은 모두 `infra/` 의 Pulumi 코드로 만들고 손으로 만들지 않는다. 클라우드 계정에 자원을 만들거나 바꾸는 명령(`pulumi up`, `aws ssm put-parameter` 등)은 사용자가 돌리거나 그때그때 승인한 것만 보낸다. 이 제품의 AWS 프로필은 `old-admin` 하나다. `default`, `memoriq` 프로필은 다른 회사 계정이므로 쓰지 않는다. 서버의 비밀은 SSM 파라미터 `/beside-pet/production/server-env` 에 있고 에이전트는 그 값을 읽지 않는다.
- memoriq 의 코드와 자료는 이 레포에 들이지 않는다.

## 읽지 않는 것

에이전트는 다음의 내용을 읽거나 출력하지 않는다. 줄 수, 행 수, 나머지 칸은 본다.

- `.env` 의 값.
- DB 의 상담 메시지, 리포트, 추모 편지 본문과 사용자의 이메일.
- DB 의 기억 행 본문(`memory_notes.text`)과 아이 이름(`pets.name`). 행 수와 종류는 본다.

서버도 이 내용을 로그와 오류 문구에 싣지 않는다.

## 적는 기준

`CLAUDE.md` 에 적는 것은 다음 둘뿐이다.

1. **에이전트가 지켜야 하는 규칙.** 하지 않는 것, 읽지 않는 것, 누가 무엇을 소유하는가, 어디에만 두는가.
2. **코드만 봐서는 의도를 알 수 없는 설계 결정.** "나이는 저장하지 않고 생년월일에서 구한다", "서버는 자른 파일을 만들지 않는다" 같은 문장. 지우면 누군가 반대로 만들 수 있는 것.

적지 않는 것: 파일, 모듈, 디렉터리의 목록과 각각의 한 줄 설명(디렉터리를 읽으면 안다), 테이블과 칸의 나열과 API 응답의 칸(마이그레이션과 타입에 있다), 환경 변수의 나열(`.env.example` 에 있다), 화면이 지금 무엇을 보여 주는가, 이력(깃 기록에 있다). 판단이 서지 않는 문장은 "이 줄을 지우면 에이전트가 틀린 것을 만드는가"로 가른다. 아니면 지운다.

자리는 읽히는 때로 정한다. 루트 `CLAUDE.md` 는 늘 읽히므로 파일을 건드리기 전에 알아야 하는 것만 둔다. 하위 디렉터리의 `CLAUDE.md`(예: `apps/<영역>/CLAUDE.md`)는 그 디렉터리의 파일을 읽거나 고친 에이전트에게만 들어가므로, 그 영역을 고칠 때의 규칙과 설계 결정을 둔다. `@경로` 가져오기와 `paths:` 조건이 없는 `.claude/rules/*.md` 는 시작 때 통째로 읽히므로 쓰지 않는다. 같은 사실은 한 곳에만 둔다. 레포의 `CLAUDE.md` 들이 가리키는 경로가 실제로 있는지는 `pnpm test` 가 검사한다. 린트(biome)와 레포 검사(큰 파일, 같은 몸체 함수, 범용 타입, git 이 무시하는 파일을 가리키는 소스)도 `pnpm test` 가 돌린다.

## 초기 단계의 승인 방식

프로젝트 초기에는 승인 토큰 절차를 두지 않는다. polydeukes 규율은 전부 권고(advise)로 두고, 차단과 witness 토큰은 쓰지 않는다. 도구 설치, 로컬 DB 변경, 실측은 묻지 않고 진행한다.

코드는 범위 안에서 자유롭게 더한다. 다만 **파괴적인 변경**은 예외다. 먼저 바꿀 코드와 사유를 사용자에게 보이고 요청해, 승인을 받은 뒤에만 한다. 파괴적인 변경이란 되돌리기 어려운 것이다: 기존 데이터를 지우거나 뜻을 바꾸는 마이그레이션, 추적되는 파일과 브랜치와 워크트리의 삭제, 기존 API 와 저장 형식의 호환을 깨는 변경, 테스트를 지우거나 약하게 만드는 변경, 운영 환경에 닿는 변경, 큰 로컬 파일의 삭제. 승인은 그 변경에만 유효하고 다음 변경에 이어지지 않는다. 팀원이 이런 변경을 만나면 멈추고 팀장에게 올리며, 팀장이 사용자에게 묻는다.

## 팀

주 세션이 팀장이고, 팀원은 `.claude/agents/` 에 정의한 에이전트다.

| 역할 | 정의 | 모델 | 맡는 일 |
|---|---|---|---|
| 팀장 | 주 세션 (`.claude/settings.json` 의 `model`) | Fable | 사용자와 상의, PRD, 일 나누기, 검수, 커밋과 마감 |
| 자료조사 | `.claude/agents/researcher.md` | Fable | 범용화되지 않은 기술의 조사와 실측 |
| 실측 | `.claude/agents/measurer.md` | Opus | 실측만 한다. C, D 등급 주장이나 수치가 필요한 질문을 받아 이 머신에서 재고, 명령과 수치를 돌려준다. 조사, 결론, 계획은 쓰지 않는다 |
| 개발 ×3 | `.claude/agents/developer.md` | Opus | 원장의 작업 구현: 서버, DB, 인프라, 도구. 동시에 셋까지 따로 띄운다 |
| 디자인 | `.claude/agents/designer.md` | Opus | 화면 안과 화면 구현 |
| 테스트 삭제 검토 | `.claude/agents/test-reviewer.md` | Opus | 지워지거나 약해진 테스트가 없어져도 되는지 판정 |
| 실측 확인 | `.claude/agents/qa.md` | Opus | 마감 전에 PRD 의 "사람이 할 일"을 QA 계정으로 제품에서 직접 해 보고 스크린샷, 사유, 결과의 보고서를 남긴다. 코드는 고치지 않는다 |

- 구현은 병렬이 기본이다. PRD 는 범위가 겹치지 않는 작업으로 나누고(`## 병렬 계획`), 팀장은 의존성이 풀린 작업을 한 단계로 모아 개발 셋과 디자인 하나에게 한 메시지로 맡긴다. 같은 단계의 작업끼리 같은 파일을 고치지 않는다. 같은 단계의 팀원들은 팀장이 보낸 명단의 agent ID 로 서로 직접 묻고 알린다(`developer.md` "팀원 간 소통").
- 팀장은 검수를 위주로 한다. 제품 코드는 팀원에게 맡기고, 돌아온 결과를 직접 읽어 확인한 뒤 커밋한다. 검수에서 보는 것은 범위를 지켰는가, "지키는 선"과 "읽지 않는 것"과 "데이터를 두는 원칙"과 그 영역의 `CLAUDE.md` 에 맞는가, 검증이 약해지지 않았는가, 보고와 실제 변경이 일치하는가다. 팀장 세션은 그 영역의 파일을 직접 읽지 않으면 하위 `CLAUDE.md` 를 받지 않으므로, PRD 를 쓰거나 검수할 때 먼저 읽는다. 한두 줄 고침과 문서, 하네스 수정은 팀장이 직접 한다.
- 작업이 끝났는지는 여전히 러너의 판정이 정한다. 검수는 그 위에 얹는 관문이고, 검수에서 걸리면 커밋하지 않고 팀원에게 돌려보낸다.
- 범용화되지 않은 기술에 기대는 기능은 PRD 를 쓰기 전에 자료조사를 먼저 거친다. 조사 보고서는 주장마다 신뢰도 등급(A 실측, B 1차 출처 확인, C 여러 보고의 일치, D 단일 보고나 추정)을 붙이고, 계획은 등급이 높은 것부터 쌓는다. C, D 에 기대는 조각은 먼저 실측해 등급을 올리거나 뒤로 미룬다.
- 잘 알려진 문제(웹 화면, 일반적인 서버 구조, 인프라)는 조사 없이 바로 PRD 로 간다.

## 계정

이 레포의 원격은 `JadenKimDev/beside-pet` 이고, 레포 고유의 값(레포, `gh` 계정, 보드 번호, 테스트를 먼저 쓰는 영역, 검사할 소스 자리)은 `project.config.json` 한 곳에 둔다. 로컬 git 설정(`credential.https://github.com.helper`)이 `JadenKimDev` 토큰으로 인증하므로 `git push` 는 그대로 쓴다. `gh` 명령은 머신의 활성 계정을 따르므로 `GH_TOKEN=$(gh auth token --user JadenKimDev)` 을 앞에 붙인다. 작업 대장 CLI(`pnpm prd:push` 등)는 이것을 스스로 한다.

## 명령

```bash
pnpm test           # biome, 전 워크스페이스 typecheck 와 테스트(레포 검사 포함), 그리고 스택의 테스트(test:stack: clippy 와 cargo test)
pnpm lint           # biome 만
pnpm db:up          # sandbox PostgreSQL(127.0.0.1:5433)을 띄운다 (db:down, db:status). pnpm sandbox:up 과 같다
pnpm prod:up        # production 과 같은 compose(DB 5434, 서버 8000, 대화 웹 8001, 운영 화면 8002)를 이 머신의 Docker 에 미리 돌려 본다 (prod:down 은 멈추기만 하고 볼륨은 남긴다). apps/server/.env.production 이 필요하다
pnpm deploy:prod    # 이 Mac 에서 arm64 이미지를 빌드해 ECR 에 올리고 EC2 에 SSM 으로 배포한다 (infra/README.md). 작업 트리가 더러우면 멈춘다
pnpm sandbox:reset  # 이 머신의 production(prod:up) DB 를 sandbox DB 에 다시 복원하고 본문을 자리 표시자로 바꾼다. 이전 sandbox 데이터는 버린다
pnpm browser:tab <주소>  # herdr 의 따로 된 탭에 터미널 브라우저를 연다 (herdr 가 있을 때만)
pnpm chat:eval run --persona <이름>  # QA 계정으로 인물 대본의 대화를 돌려 outputs/chat-eval/<날짜>/ 에 전사와 자동 검사를 남긴다 (--all, --interactive, --stream, --baseline <날짜>. 절차는 chat-eval 스킬)
```

```bash
pnpm dev            # Rust 서버(3000)와 대화 웹(3001)과 운영 화면(3002)을 sandbox 로 띄운다(APP_ENV=sandbox). 서버는 apps/server/.env.sandbox 와 sandbox PostgreSQL 이 필요하다. 워크트리(브랜치 prd/<이슈>)에서는 <이슈>10·<이슈>11·<이슈>12 와 호스트 <이슈>.localhost 로 떠서 본 체크아웃과 겹치지 않는다. 브랜치가 prd/<숫자> 가 아닌 워크트리에서는 멈춘다
APP_ENV=sandbox dev-tools/scripts/cargo.sh run -p beside-pet-server   # Rust 서버(3000)만. cargo 는 이 머신의 PATH 에 없어 래퍼로 부른다. APP_ENV 와 DATABASE_URL 이 없으면 뜨지 않는다
```

화면은 루프백(127.0.0.1)에만 연다. `test:stack` 의 `cargo test` 는 DB 테스트를 품으므로 `DATABASE_URL`(환경 또는 `apps/server/.env.sandbox`)과 떠 있는 sandbox Postgres 가 필요하고, 없으면 이유를 적고 실패한다.

작업 대장:

```bash
pnpm prd:new <kebab-설명> [--fix]  # 틀을 docs/prd/<kebab-설명>.md 로 복사하고 머리말에 drafted_at 을 적는다. --fix 는 수정 틀
pnpm prd:push docs/prd/<파일>.md [--draft]  # PRD 를 GitHub 이슈로 올리거나 갱신하고 보드에 올린다. --draft 는 초안 라벨을 붙여 번호부터 받는다
pnpm prd:pull <이슈>              # 이슈 본문을 docs/prd/ 캐시로 받는다
pnpm prd:pane docs/prd/<파일>.md  # herdr 오른쪽 pane 에 초안을 vi 로 연다 (herdr 가 없으면 경로만 알린다)
pnpm wt:create <이슈>             # PRD 승인 뒤: prd/<이슈> 워크트리를 만든다 (herdr 가 있으면 workspace 로 연다)
pnpm wt:pane <이슈>               # 새 탭에 워크트리의 Claude 를 띄워 /implement-prd 를 맡긴다 (herdr 가 없으면 띄울 명령을 알린다)
pnpm wt:finish <이슈>             # 마감: 브랜치를 main 에 fast-forward 로 합치고 푸시한다
pnpm wt:remove <이슈>             # 워크트리, workspace, 브랜치, 구현 pane 을 치운다
pnpm wt:status
pnpm ledger:new docs/prd/<파일>.md
pnpm work <이슈> <작업>           # 작업을 집는다 (예: pnpm work 12 S1)
pnpm ledger:red <이슈> <작업>     # 테스트만 쓴 상태에서 검증이 실패하는 것을 기록한다
pnpm ledger:verify <이슈> <작업>  # 검증을 돌려 판정을 적는다
pnpm finish <이슈>                # 실측을 기록하고 원장을 지운다
pnpm ledger:status [이슈]
pnpm ledger:outcomes              # 끝난 이슈의 실측
pnpm ledger:accuracy              # PRD 의 추정과 실측을 맞댄 정확도
pnpm docs:search "<낱말>"         # 결정 기록(ADR, 개발 일지)을 찾는다. 색인이 낡았으면 먼저 다시 만든다
pnpm docs:index                   # 결정 기록 색인(docs/docs.db)을 다시 만든다
```

herdr 는 선택이다. 없으면 워크트리는 git worktree 로만 만들고, 구현 세션은 사용자가 새 터미널에서 띄운다.

## 구조

| 경로 | 언어 | 책임 | 상태 |
|---|---|---|---|
| `apps/` | TypeScript | 제품 코드. 영역마다 `apps/<영역>/` 하나와 그 영역의 규칙을 담은 `apps/<영역>/CLAUDE.md` | 있음 |
| `apps/server/` | Rust (axum, sqlx) | 서버. 엔드포인트의 겉은 옛 TS API 의 것을 그대로 가진다(ADR-0015, ADR-0019) | 있음 |
| `apps/backoffice/` | TypeScript (Next.js) | 운영 화면. 서버의 관리자 API 만 부르고 본문을 보이지 않는다. 구조는 FSD(ADR-0024) | 있음 |
| `showcase/` | JSON, WebP | 포트폴리오용 자료. 대화 웹이 빌드 때 자기 public 아래로 복사해 `/showcase` 에서 보인다(ADR-0029) | 있음 |
| `packages/dev-checks/` | TypeScript | 개발 전용 검사. 레포 검사 규칙(큰 파일, 같은 몸체 함수, 범용 타입)의 순수 함수와 단위 테스트 | 있음 |
| `dev-tools/scripts/` | bash | 워크트리, pane, 브라우저 탭 스크립트 | 있음 |
| `dev-tools/src/` | TypeScript (Node 가 직접 실행) | 작업 대장 CLI(PRD 와 이슈, 프로젝트 보드, 원장 러너, 결정 기록 색인)와 레포 전체의 검사 | 있음 |
| `project.config.json` | JSON | 레포 고유의 값. 작업 대장과 레포 검사와 `wt.sh` 가 읽는다 | 있음 |
| `docs/ledger/` | JSON | 진행 중인 이슈의 원장(`<이슈 번호>.json`), 끝난 이슈의 실측(`outcomes.jsonl`) | 러너가 씀 |
| `docs/prd/` | Markdown | PRD 캐시. 정본은 GitHub 이슈 | 로컬, gitignore |
| `docs/adr/`, `docs/devlog/` | Markdown | 결정 기록(왜 그렇게 정했나, 무엇을 버렸나)과 개발 일지(해 봤는데 안 된 일). 머리말의 `id`, `tags`, `related` 를 색인이 읽는다. `docs/docs.db` 는 거기서 만든 검색 색인(gitignore) | 있음 |
| `docs/research/` | Markdown | 조사 보고서 | 로컬, gitignore |
| `.claude/agents/` | Markdown | 팀원 정의 | 있음 |
| `.claude/skills/` | Markdown | 작업 흐름의 절차 | 있음 |
| `infra/` | TypeScript (Pulumi) | production 의 인프라 정의(EC2, CloudFront, ECR, ADR-0023). 손으로 만든 자원 대신 코드로 둔다 | 있음 |
| `outputs/`, `data/` | - | 실측 산출물, QA 보고서, 로컬 상태 | 로컬, gitignore |

## 데이터를 두는 원칙

- DB 에는 최소한의 사실만 기록한다. 일어난 일을 일어난 그대로 적고, 요약하거나 계산한 값은 저장하지 않는다. 테이블과 칸은 지금 필요한 사실에만 만들고, 쓸지 모르는 칸을 미리 두지 않는다.
- 가공은 DB 안에서만 한다. 집계와 파생 값은 쿼리와 뷰로 만들고, 서버 코드가 가공한 결과를 따로 저장해 두지 않는다.
- 운영 중인 DB 의 구조가 먼저다. 위 원칙과 어긋나는 기존 구조는 바꾸지 않고, 바꿀 필요가 보이면 ADR 로 제안한다.

## 작업 흐름

작업은 PRD 하나에서 시작해 닫힌 이슈로 끝난다. 순서가 있는 절차는 스킬이 갖고, 이 문서는 길만 가리킨다.

| 하려는 일 | 들어가는 곳 |
|---|---|
| 작업 명세를 쓰고 원장을 만든다 | `.claude/skills/prd/SKILL.md` |
| PRD 하나를 구현하고 마감한다 | `.claude/skills/implement-prd/SKILL.md` |
| 웹 화면을 띄워 보거나 확인한다 | `.claude/skills/open-web/SKILL.md` |
| 결정의 이유를 찾거나 적는다 | `docs/adr/README.md` (`pnpm docs:search`) |

- PRD 의 정본은 `JadenKimDev/beside-pet` 의 GitHub 이슈다.
- 구현은 라벨로도 시킬 수 있다. 이슈에 `run:implement`(또는 `run:again`)를 붙이면 이 Mac 의 self-hosted 러너가 워크트리에서 `implement-prd` 를 돌린다(ADR-0032, 러너 등록은 사용자가 `dev-tools/scripts/runner/README.md` 대로). 러너의 결과는 이슈 댓글과 라벨(`review:ready`, 막히면 `run:blocked`)이고, 이슈를 닫는 것은 사람이다.
- 작업의 이름은 이슈 번호다. 따로 만든 티켓 번호는 쓰지 않는다. PRD 안의 작업은 `S1`, `S2` 로 부른다.
- 이슈는 프로젝트 보드(`project.config.json` 의 `boardNumber`)에서 본다. `prd:push` 가 이슈를 보드에 올리고, 첫 작업을 집으면 러너가 In progress 로 옮긴다. 닫힌 이슈를 Done 으로 옮기는 것은 보드의 자동화다. 보드는 창이고 판정의 정본은 원장이라, 보드 번호가 없거나 보드에 닿지 못해도 러너는 멈추지 않는다.
- 원장의 판정 칸(`status`, `passes`, `retries`, `red_at`, 시각)은 `pnpm work`, `pnpm ledger:red`, `pnpm ledger:verify`, `pnpm finish` 만 쓴다. 작업이 끝났는지는 검증 명령의 종료 코드가 정한다.
- 제품 코드(`project.config.json` 의 `tddAreas`, 기본은 `apps/` 전부)는 테스트를 먼저 쓴다. 러너는 테스트만 쓴 상태의 실패(`pnpm ledger:red`)가 기록돼야 판정을 내린다. 인프라, 도구, 문서는 해당하지 않는다.
- 테스트를 지우거나 약하게 만든 변경은 팀장이 `test-reviewer` 에게 맡겨 판정받은 뒤 커밋한다.
- PRD 의 "사람이 할 일"은 마감 때 `qa` 팀원이 대신 한다. 계정은 `.claude/agents/qa.md` 에 적은 QA 계정뿐이고 실제 사용자의 계정에는 닿지 않는다. 보고서는 `outputs/qa/<이슈>/report.html`(로컬)이고 마감 뒤 사용자의 브라우저로 띄운다. 모두 통과해야 마감하고, 워크트리를 치울지는 사용자가 정한다.
- `CLAUDE.md` 를 고치는 작업은 PRD 에 기본으로 넣지 않는다. 그 PRD 가 새 규칙이나 설계 결정을 만들었거나 이미 적힌 것을 틀리게 만들었을 때만, 그 규칙이 닿는 자리의 문서를 고치는 작업을 둔다. 규칙은 `.claude/skills/prd/SKILL.md` 에 있다.
- PRD 마다 워크트리에서 일한다. 승인된 PRD 는 `prd/<이슈>` 브랜치의 워크트리를 얻고(자리는 `dev-tools/scripts/wt.sh` 의 머리 주석), 구현 세션은 그 워크트리에서 돈다. 작업마다 브랜치에 커밋하고, 마감 때 main 에 fast-forward 로 합쳐 푸시한다. PR 은 쓰지 않는다. 마감 커밋의 `Closes #<이슈>` 가 이슈를 닫는다. gitignore 된 로컬 폴더(`data/`, `outputs/`, `docs/prd/`, `docs/research/`, `.env`)는 워크트리가 본 체크아웃의 것을 링크로 같이 쓴다. 빌드 폴더 중 Rust 의 `target/` 만 본 체크아웃의 것을 같이 쓰고(`cargo.sh` 가 `CARGO_TARGET_DIR` 로 정하고, 4G 를 넘으면 비운다), 나머지 빌드 폴더는 워크트리마다 따로다. `pnpm wt:remove` 는 치우기 전에 소스 디렉터리(`apps/`, `packages/`, `dev-tools/`) 아래에 git 이 무시하는 파일이 남아 있으면 그 목록을 보이고 멈춘다. 같은 사고를 미리 잡으려고 `pnpm test` 는 추적되는 소스가 가리키는 파일(상대 가져오기)을 git 이 무시하면 실패하고, `.gitignore` 의 디렉터리 규칙은 루트에 묶는다(`/data/` 처럼). 소스 아래의 같은 이름이 가려지지 않게 하려는 것이다.

## 출처 경계

여러 프로젝트에 쓸 만한 도구는 이 레포가 아니라 관리 레포의 하네스(`/Users/taehokim/freelance/base/harness/`)에 범용으로 다시 작성해 둔다. 고객 레포의 코드를 이 레포로 가져오지 않는다.

하네스는 MIT 라이선스인 polydeukes 를 설치해 쓰고, 나머지 도구는 하네스에서 작성한 것이다. 새 의존성을 들일 때는 라이선스를 확인하고, 상업 이용을 막는 라이선스(예: 비상업, 강한 카피레프트)는 팀장에게 올린다.
