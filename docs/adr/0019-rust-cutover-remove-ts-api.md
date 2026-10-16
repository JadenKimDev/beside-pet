---
id: ADR-0019
date: 2026-10-16
status: accepted
tags: [rust, server, migration, dev-tools, docker]
related: [ADR-0015, ADR-0018]
---
# TS(NestJS) API 를 지우고, 개발 명령과 이미지와 compose 를 Rust 서버로 돌린다

## 맥락

ADR-0015 는 서버를 axum 과 sqlx 로 다시 쓰고 엔드포인트의 겉을 먼저 그대로 옮기기로 했다. #7~#10 이 28개 라우트와 identity, llm, safety, support 의 속을 채워, Rust 서버(`apps/server`)가 웹이 부르는 모든 엔드포인트를 맡는다. 그런데 `pnpm dev`, Dockerfile, compose 는 아직 TS API 를 띄웠고, 두 서버가 함께 있으면 어느 쪽이 정본인지 문서와 명령이 갈린다. 운영 환경이 없어(2026-10-16 AWS 자원을 모두 내림) 옮겨 갈 운영 트래픽은 없다.

## 결정

2026-10-16, #11 에서 TS API 를 지우고 Rust 서버만 남긴다.

- `pnpm dev` 는 `dev-tools/scripts/dev.sh` 로 Rust 서버(3000)와 대화 웹(3001)을 함께 띄운다.
- 운영 이미지는 `apps/server/Dockerfile`(빌드는 캐시 마운트, 런타임은 distroless `cc-debian12:nonroot`)이다.
- compose 는 `apps/server/docker-compose.yml`(`db`, `api`)이고 `dev-tools/scripts/db.sh` 가 그것을 가리킨다.

### 지운 것

- `apps/api` 의 추적 파일 193개 전부와 pnpm 워크스페이스의 그 패키지, lockfile 의 그 importer 와 그것만 쓰던 패키지.
- TS 의 Dockerfile, `docker-compose.yml`.
- 위기 감지 특성화 테스트 3개(`apps/api/src/safety/` 아래 `*.test.ts`). `test-reviewer` 가 Rust 의 `apps/server/src/safety/crisis/tests.rs`, `safety/resources/tests.rs`, `safety/api/tests.rs` 가 같은 입력을 덮는다고 판정했다(되살릴 것 없음).

### 옮긴 것

- compose 의 `db` 서비스 → `apps/server/docker-compose.yml`.
- `apps/api/README.md` 와 `apps/api/docs/` 의 설계 의도(흐름과 발화의 분리, 단계와 깊이 게이트, 안전, 세션 잇기와 마음 리포트, 분석, 저장, 모델, 인증) → `apps/server/README.md` "설계 의도".
- `rag-knowledge/` 는 이미 `apps/server/rag-knowledge/` 에 복사돼 있었다.

## 버린 것

| 안 | 이유 |
|---|---|
| TS API 를 한동안 함께 둠 | 운영 트래픽이 없어 되돌릴 대상이 없고, 두 서버가 있으면 명령과 문서가 갈린다. 되돌리기는 git 기록으로 충분하다 |
| `apps/api/docs` 의 로드맵 Phase 2·3(Langfuse 관측, LLM-judge, 사용자 피드백 테이블, Redis 레이트리밋·큐, AWS 배포 경로, AI 주도 검증 자동화)을 옮김 | 아직 하지 않은 계획이고 TS 구조(모듈, 데코레이터)에 기대어 쓰였다. 다시 하려면 Rust 기준으로 새 PRD 를 쓴다 |
| ECR 저장소 이름과 compose 서비스 이름을 바꿈 | `infra/` 의 Pulumi 가 `beside-pet-api` 를 쓰고, 이름은 언어가 아니라 역할(API)을 가리킨다. 운영 환경이 없는 지금 바꿀 이유가 없다 |

## 결과

- 서버는 `apps/server` 하나다. 엔드포인트의 겉은 옛 TS API 의 것 그대로다(ADR-0015). 겉을 바꾸려면 웹과 함께 PRD 로 다룬다.
- 이미지는 distroless 의 Rust 바이너리이고, ECR 저장소 이름 `beside-pet-api` 와 compose 서비스 이름 `api` 는 그대로다.
- 옛 ADR(예: ADR-0004, ADR-0014, ADR-0018)의 "근거"에 적힌 `apps/api/…` 경로는 그때의 기록이라 고치지 않는다. 그 파일은 git 기록에서 본다.
- 되돌리기: 지우기 전의 커밋(`prd/11` 의 S2 커밋, `5551275`)에서 `apps/api` 와 `pnpm-lock.yaml` 을 꺼낸다.

## 근거

- 이슈 #11(Rust 서버로 전환)의 "설계".
- `apps/server/Dockerfile`, `apps/server/docker-compose.yml`, `dev-tools/scripts/dev.sh`, `dev-tools/scripts/db.sh`, `apps/server/README.md`.
- `infra/aws-web.ts` 의 `repository("beside-pet-api")`.
