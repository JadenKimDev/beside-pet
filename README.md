# Beside Pet

반려동물을 떠나보낸 보호자를 위한 AI 감정 지원 웹서비스. 보호자가 아이의 이야기를 꺼내 놓을 수 있게 한 사람의 결을 가진 동반자가 곁에서 대화를 이어 가고, 대화가 닫히면 마음 리포트를 남긴다. 상담이나 치료가 아니며 그렇게 부르지 않는다(ADR-0003).

레포는 `JadenKimDev/beside-pet` 이고, 실제 제품과 포트폴리오용 자료를 한 레포에서 관리한다. 모바일 앱은 접었고 웹으로만 운영한다.

## 지금 상태 (2026-10-22)

production 은 AWS 의 EC2 한 대(앞에 CloudFront)에 떠 있고, 배포된 커밋은 `3ac5347` 이다. 주소는 CloudFront 기본 도메인이고(`infra/` 의 `pulumi stack output cloudFrontDomain`), 커스텀 도메인은 쓰지 않는다.

제품이 지금 하는 일:

- **대화.** 첫 인사부터 아이의 이야기, 남겨진 마음, 마무리까지 단계를 가진 대화. 발화는 한 사람의 페르소나로 짧고 담백하게 하고, 사용자의 감정을 대신 설명하거나 뜻을 붙이지 않는다(ADR-0027, ADR-0033).
- **장기기억.** 사용자가 직접 말한 사실(아이의 이름과 습관, 함께 다니던 곳, 남긴 물건, 사람, 날짜, 의식, 선호)을 계정 단위로 저장해 다음 대화에서도 안다. 말을 바꾸면 새 말을 따르고, "기억하지 마" 는 남기지 않는다. 오랜만에 오면 처음부터 천천히 다시 시작하고, 떠난 정황이나 자책은 먼저 꺼내지 않는다. 마지막 대화 뒤 열두 달이 지나면 지운다(ADR-0034).
- **위기 대응.** 자해·자살 발화를 감지하면 대화를 멈추고 전문 자원 안내로 잇는다. 이 흐름은 약하게 만들지 않는다.
- **마음 리포트.** 대화가 닫히면 그 대화의 마음 리포트를 남긴다.
- **공개 쇼케이스.** 로그인 없이 `/showcase` 에서 지어낸 반려견과의 대화 한 사이클과 쉬운 말로 쓴 개발 기록을 본다(ADR-0029).
- **운영 화면.** `apps/backoffice` 는 이 머신에서만 띄우고 서버의 관리자 API 만 부른다. 대화 본문은 보이지 않는다(ADR-0024).

AI 모델은 Anthropic Claude Haiku 다. 개발과 실측은 API 키 대신 Claude Code 구독을 셈(`dev-tools/scripts/claude-shim.py`)으로 쓴다.

## 구조

| 경로 | 무엇 |
|---|---|
| `apps/web` | 대화 웹 (Next.js). 흐름 판단은 없고 화면과 입력만 |
| `apps/server` | 서버 (Rust, axum, sqlx, PostgreSQL). 대화 흐름, 프롬프트 층, 위기 판정, 기억 추출, 리포트 |
| `apps/backoffice` | 운영 화면 (Next.js, 로컬 전용) |
| `showcase/` | 포트폴리오용 자료(지어낸 대화의 스크린샷과 전사, 개발 기록). 빌드 때 대화 웹이 복사한다 |
| `infra/` | production 인프라 (Pulumi: EC2, CloudFront, ECR)와 compose, 배포 스크립트 |
| `dev-tools/` | 작업 대장 CLI, 워크트리 스크립트, 대화 실측(`chat:eval`), 러너 |
| `docs/adr/`, `docs/devlog/` | 결정의 이유와 해 봤는데 안 된 일. `pnpm docs:search "<낱말>"` 로 찾는다 |

## 시작

```bash
pnpm install
pnpm db:up                                            # sandbox PostgreSQL (127.0.0.1:5433)
cp apps/server/.env.example apps/server/.env.sandbox  # 처음 한 번. DATABASE_URL 과 모델 설정을 채운다
pnpm dev                                              # 서버 3000, 대화 웹 3001, 운영 화면 3002 (루프백만)
pnpm test                                             # biome, typecheck, 단위·통합 테스트, clippy, cargo test
```

실행 환경은 production 과 sandbox 둘이다(ADR-0021). sandbox 는 개발·테스트·실측용이고, 실제 사용자의 데이터는 넣지 않는다. 각 영역의 자세한 띄우기는 `apps/server/README.md`, `apps/web/README.md`, `apps/backoffice/README.md`, 인프라와 배포는 `infra/README.md` 에 있다.

```bash
pnpm prod:up        # production 과 같은 compose 를 이 머신의 Docker 에 미리 돌려 본다
pnpm deploy:prod    # arm64 이미지를 빌드해 ECR 에 올리고 EC2 에 배포한다. 작업 트리가 더러우면 멈춘다
pnpm chat:eval arc --arc <이름>   # 지어낸 인물의 3달치 대화 궤적으로 대화 품질을 실측한다
```

## 일하는 방식

Claude Code 팀(팀장과 팀원 에이전트)이 PRD 하나를 GitHub 이슈로 올리고, 작업 원장과 워크트리에서 구현해 main 에 fast-forward 로 합쳐 이슈를 닫는다. 마감 전에 QA 팀원이 PRD 의 "사람이 할 일" 을 제품에서 직접 해 보고 보고서를 남긴다. 에이전트가 지키는 규칙과 설계 결정은 [`CLAUDE.md`](./CLAUDE.md) 에 있다.
