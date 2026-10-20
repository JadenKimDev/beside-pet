# Docker 환경

`compose.yaml` 하나를 프로젝트 이름으로 갈라 두 환경을 띄운다. `name:` 을 고정하지 않으므로 볼륨(`<프로젝트>_dbdata`)과 컨테이너가 프로젝트마다 따로 생긴다. 호스트 포트는 모두 `127.0.0.1` 에만 연다.

| 환경 | 프로젝트 이름 | DB | 서버 | 대화 웹 | 쓰는 곳 |
|---|---|---|---|---|---|
| production | `beside-production` | 127.0.0.1:5434 (컨테이너) | 127.0.0.1:8000 (컨테이너) | 127.0.0.1:8001 (컨테이너) | 실제로 쓰는 환경. 나중에 인스턴스로 옮긴다 |
| sandbox | `beside-sandbox` | 127.0.0.1:5433 (컨테이너) | 127.0.0.1:3000 (`pnpm dev`) | 127.0.0.1:3001 (`pnpm dev`) | 개발, 테스트, 실측. production DB 를 본문을 지워 복사한 것 |

## 서비스

- `db`: `pgvector/pgvector:pg16`. 사용자, 비밀번호, DB 이름은 `beside` / `beside` / `besidepet`.
- `api`: `apps/server/Dockerfile`, 프로필 `full`. 컨테이너 안 3000.
- `web`: `apps/web/Dockerfile`, 프로필 `full`. 컨테이너 안 3001. 빌드 인자 `NEXT_PUBLIC_API_BASE_URL` 은 `http://127.0.0.1:${API_PORT}` 다.

## 포트 변수

| 변수 | compose 기본 | 대상 |
|---|---|---|
| `DB_PORT` | 5434 | `db` (sandbox 는 스크립트가 5433 을 넘긴다) |
| `API_PORT` | 8000 | `api` |
| `WEB_PORT` | 8001 | `web` |

5432 는 이 머신에서 다른 프로젝트의 Postgres 가 쓴다.

## 서버 설정

compose 가 `api` 에 `APP_ENV=production`, `PORT`, `DATABASE_URL`(compose 안의 `db`), `COOKIE_SECURE`(기본 `false`, http 루프백에서 로그인을 유지하려고), `OLLAMA_BASE_URL`(기본 `http://host.docker.internal:11434`)을 준다. 나머지 비밀과 모델 설정(`JWT_SECRET`, `LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` 등)은 `apps/server/.env.production`(gitignore)에서 받는다. 비밀 값은 compose 파일에 쓰지 않는다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm prod:up` / `pnpm prod:down` | production 의 `db`, `api`, `web` 을 띄운다 / 내린다. 데이터는 볼륨에 남는다 |
| `pnpm sandbox:up` / `pnpm sandbox:down` | sandbox 의 `db` 를 띄운다 / 내린다 |
| `pnpm sandbox:reset` | production DB 를 sandbox DB 에 다시 복원하고 본문을 자리 표시자로 바꾼다 |
| `pnpm db:up` (`db:down`, `db:status`) | sandbox DB 의 별칭 |

스크립트는 `infra/docker/scripts/` 에 있다.
