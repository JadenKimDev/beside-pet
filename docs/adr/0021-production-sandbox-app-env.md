---
id: ADR-0021
date: 2026-10-20
status: accepted
tags: [server, docker, environment, config, data, dev-tools]
related: [ADR-0015, ADR-0019, ADR-0007]
---
# 환경은 production 과 sandbox 둘이고 `APP_ENV` 가 고르며, sandbox 는 본문을 지운 production 의 복사본이다

## 맥락

서버는 `NODE_ENV` 로 development 와 production 을 나눴고, `.env.development` 과 `.env` 를 읽었다. 이 이름은 옛 TS API 의 것을 그대로 둔 것이다(ADR-0015 "환경 변수 이름은 바꾸지 않는다"). 배포한 운영 환경은 없다(2026-10-16 AWS 자원을 모두 내림). 개발 DB 는 지어낸 데이터뿐이라 실제 상태와 행 수 분포로 실측할 수 없었다.

compose 는 `apps/server/docker-compose.yml`(`db`, `api`)에 있었다(ADR-0019). 이 머신의 5432 는 다른 프로젝트의 Postgres 가 쓰고 있다(2026-10-20 확인).

## 결정

- **환경은 둘이다.** production 은 실제로 쓰는 환경이고 지금은 이 머신의 Docker 에 띄우며 나중에 인스턴스로 옮긴다. sandbox 는 개발, 테스트(`cargo test`), 실측(`pnpm chat:eval`)용이다.
- **서버는 `APP_ENV`(`production` | `sandbox`)로 환경을 고른다.** `NODE_ENV` 는 더 읽지 않는다. 읽는 파일은 `.env.production`, `.env.sandbox` 이고 `.env.development` 과 `.env` 는 더 읽지 않는다. `APP_ENV` 가 없거나 모르는 값이면 `APP_ENV` 를 이름으로 적은 오류로 기동하지 않는다. production 이면 `JWT_SECRET` 이 필수이고 모든 주소에 열며, sandbox 면 루프백에만 연다.
  - 이것은 ADR-0015 의 "환경 변수 이름은 옛 TS API 와 같다"의 예외다(사용자 결정 2026-10-20: Rust 기준으로 다 바꾼다). ADR-0015 의 나머지(경로, 요청·응답 모양, 상태 코드, 오류 문구)는 그대로이므로 ADR-0015 를 superseded 로 바꾸지 않는다.
  - ADR-0007 "결과"의 "쿠키의 Secure 는 `NODE_ENV` 가 production 일 때만"은 이제 `COOKIE_SECURE` 가 있으면 그 값, 없으면 `APP_ENV=production` 일 때 붙는 것으로 읽는다.
- **compose 는 `infra/docker/compose.yaml` 하나이고 프로젝트 이름으로 환경을 가른다**(`beside-production`, `beside-sandbox`). `apps/server/docker-compose.yml` 은 여기로 옮기고 지운다. 볼륨과 포트는 겹치지 않고, 호스트 포트는 모두 루프백(127.0.0.1)에만 연다.

  | 환경 | DB | 서버 | 대화 웹 |
  |---|---|---|---|
  | production | 5434 (컨테이너) | 8000 (컨테이너) | 8001 (컨테이너) |
  | sandbox | 5433 (컨테이너) | 3000 (`pnpm dev`) | 3001 (`pnpm dev`) |

  비밀 값은 compose 에 쓰지 않고 `apps/server/.env.production`(gitignore)에서 받는다.
- **sandbox 의 데이터는 production 의 복사본에서 본문을 자리 표시자로 바꾼 것이다.** `pnpm sandbox:reset` 이 production DB 를 `pg_dump` 로 떠 sandbox DB 의 `psql` 로 바로 파이프한다. 디스크에 덤프 파일을 만들지 않고, production 에는 읽기만 한다.
  - 바꾸는 칸의 목록은 `infra/docker/scripts/sandbox-scrub.sql` 한 곳에 둔다. 사용자가 쓴 본문(대화 메시지, 리포트, 애도 프로필과 분석 JSONB 의 문자열 값)을 `[sandbox]` 자리 표시자로 바꾼다.
  - 행 수, 칸의 구조, 상태, 시각, 집계용 칸은 그대로 둔다. `username` 과 `password_hash` 는 sandbox 에서 같은 계정으로 로그인하려고 그대로 둔다.
  - 바꾼 뒤 자리 표시자가 아닌 본문이 남았는지 검사하고, 하나라도 남으면 sandbox DB 를 비우고 실패로 끝낸다.
- **루트 `CLAUDE.md` "지키는 선"과의 관계.** "실제 사용자의 데이터를 개발 DB 에 넣지 않는다"는 그대로다. sandbox 에 허용하는 것은 본문이 없는 복사본뿐이다. 남은 본문 검사를 통과하지 못한 복사본은 남기지 않는다. 테스트 픽스처는 여전히 지어낸 값으로 만든다.

## 버린 것

| 안 | 이유 |
|---|---|
| `NODE_ENV` 이름을 두고 값에 `sandbox` 만 더함 | `NODE_ENV` 는 Node 와 Next 의 빌드 모드라는 뜻이 따로 있다. 사용자가 Rust 기준으로 다 바꾸기로 했다 |
| compose 를 `apps/server/` 에 두고 프로젝트 이름만 가름 | 웹 컨테이너까지 묶는 환경 정의라 서버 디렉터리의 자리가 아니다. 사용자 결정: `infra/docker` |
| 덤프 파일을 디스크에 두고 복원 | 에이전트가 열 수 있는, 본문이 담긴 파일이 생긴다(루트 `CLAUDE.md` "읽지 않는 것") |
| production DB 를 5432 에 둠 | 이 머신에서 다른 프로젝트의 Postgres 와 충돌한다 |
| 복사 없이 지어낸 시드만 씀 | production 의 실제 상태와 행 수 분포로 실측하려는 목적과 맞지 않는다 |

## 결과

- `pnpm dev`, `pnpm test`, `pnpm chat:eval` 은 sandbox DB 를 본다. `pnpm db:up` 등은 sandbox DB 의 별칭으로 남는다.
- 새 sandbox 는 빈 볼륨에서 시작하므로 QA 계정은 production 에서 만든 뒤 `sandbox:reset` 으로 가져온다.
- 스키마에 사용자가 쓰는 본문 칸을 더하는 마이그레이션은 `sandbox-scrub.sql` 과 남은 본문 검사에도 그 칸을 더해야 한다.
- 옛 개발 DB 볼륨 `beside-pet_dbdata` 는 건드리지 않았다. 치울지는 사용자가 정한다.
- `infra/` 의 Pulumi 스택(dev, prod)은 클라우드 배포용이라 이 결정과 무관하다.

## 근거

- 이슈 #2(실행 환경을 production 과 sandbox 로 나누고 둘 다 Docker 로 띄운다)의 "설계".
- 루트 `CLAUDE.md` "지키는 선", "읽지 않는 것".
- `apps/server/src/shared/config.rs`, `infra/docker/compose.yaml`, `infra/docker/scripts/`.
