# Docker 환경

production 은 AWS 의 EC2 인스턴스 한 대이고, 앞의 CloudFront 가 `https://app.besidepet.com` 으로 연다(인프라는 `infra/` 의 Pulumi 코드). 이 머신의 `pnpm prod:up` 은 같은 세 서비스(db, api, web)를 이 머신에서 미리 돌려 보는 것이다.

| 파일 | 어디서 | 하는 일 |
|---|---|---|
| `compose.host.yaml` | EC2 의 `/opt/beside-pet/` | production. 이미지를 빌드하지 않고 ECR 에서 `${ECR_REGISTRY}/beside-pet-{api,web}:${IMAGE_TAG}` 로 받는다. 프로젝트 이름은 `beside-production` 으로 고정 |
| `scripts/host-deploy.sh` | EC2 의 `/opt/beside-pet/` | `host-deploy.sh <IMAGE_TAG>`. ECR 로그인, 서버 설정 내려 쓰기, pull, `up -d --wait`, `image prune` |
| `compose.yaml` | 이 머신 | 미리 돌려 보는 production(`pnpm prod:up`)과 sandbox. 프로젝트 이름으로 갈라 쓴다 |

두 compose 파일의 서비스와 설정은 같게 둔다. 하나를 바꾸면 다른 하나도 맞춘다.

## EC2 의 production

user-data(`infra/` 의 호스트 정의)가 `compose.host.yaml` 과 `host-deploy.sh` 를 `/opt/beside-pet/` 에 놓는다. 배포는 Mac 에서 `pnpm deploy:prod` 가 이미지를 arm64 로 빌드해 ECR 에 밀고, SSM Run Command 로 `/opt/beside-pet/host-deploy.sh <git sha>` 를 부른다.

- 포트: api 8000, web 8001 을 모든 주소에 연다. 보안 그룹이 CloudFront 에서 오는 것만 들인다. db 의 5432 는 호스트에 열지 않는다.
- 서버 설정: SSM Parameter Store 의 SecureString `/beside-pet/production/server-env` 에 `.env.production` 의 내용을 그대로 둔다(사용자가 넣는다). `host-deploy.sh` 가 배포마다 이것을 `/opt/beside-pet/.env.production`(0600)으로 내려 쓰고, 값은 로그에 찍지 않는다.
- 쿠키: `COOKIE_SECURE` 를 두지 않아 `APP_ENV=production` 의 기본(Secure)이다. https 는 CloudFront 가 끝낸다. web 이미지는 `NEXT_PUBLIC_API_BASE_URL=` 빈 값(같은 출처 상대 경로)으로 빌드한다.
- healthcheck: api 이미지는 distroless 라 셸이 없어 healthcheck 를 두지 않는다. web 의 healthcheck 가 자기 화면과 api 의 `/v1/health` 를 함께 보고, `up --wait` 가 그것을 기다린다.
- 데이터: 볼륨 `beside-production_dbdata`(루트 EBS, DLM 일일 스냅샷).

## 이 머신

`compose.yaml` 하나를 프로젝트 이름으로 갈라 두 환경을 띄운다. `name:` 을 고정하지 않으므로 볼륨(`<프로젝트>_dbdata`)과 컨테이너가 프로젝트마다 따로 생긴다. 호스트 포트는 모두 `127.0.0.1` 에만 연다.

| 환경 | 프로젝트 이름 | DB | 서버 | 대화 웹 | 쓰는 곳 |
|---|---|---|---|---|---|
| production 미리 돌려 보기 | `beside-production` | 127.0.0.1:5434 (컨테이너) | 127.0.0.1:8000 (컨테이너) | 127.0.0.1:8001 (컨테이너) | 이미지와 compose 를 이 머신에서 확인한다 |
| sandbox | `beside-sandbox` | 127.0.0.1:5433 (컨테이너) | 127.0.0.1:3000 (`pnpm dev`) | 127.0.0.1:3001 (`pnpm dev`) | 개발, 테스트, 실측. production DB 를 본문을 지워 복사한 것 |

### 서비스

- `db`: `pgvector/pgvector:pg16`. 사용자, 비밀번호, DB 이름은 `beside` / `beside` / `besidepet`.
- `api`: `apps/server/Dockerfile`, 프로필 `full`. 컨테이너 안 3000.
- `web`: `apps/web/Dockerfile`, 프로필 `full`. 컨테이너 안 3001. 빌드 인자 `NEXT_PUBLIC_API_BASE_URL` 은 `http://127.0.0.1:${API_PORT}` 다(EC2 의 이미지와 다르다).

### 포트 변수

| 변수 | compose 기본 | 대상 |
|---|---|---|
| `DB_PORT` | 5434 | `db` (sandbox 는 스크립트가 5433 을 넘긴다) |
| `API_PORT` | 8000 | `api` |
| `WEB_PORT` | 8001 | `web` |

5432 는 이 머신에서 다른 프로젝트의 Postgres 가 쓴다.

### 서버 설정

compose 가 `api` 에 `APP_ENV=production`, `PORT`, `DATABASE_URL`(compose 안의 `db`), `COOKIE_SECURE`(기본 `false`, http 루프백에서 로그인을 유지하려고), `OLLAMA_BASE_URL`(기본 `http://host.docker.internal:11434`)을 준다. 나머지 비밀과 모델 설정(`JWT_SECRET`, `LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` 등)은 `apps/server/.env.production`(gitignore)에서 받는다. 비밀 값은 compose 파일에 쓰지 않는다.

### 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm prod:up` / `pnpm prod:down` | production 의 `db`, `api`, `web` 을 이 머신에 띄운다 / 내린다. 데이터는 볼륨에 남는다 |
| `pnpm sandbox:up` / `pnpm sandbox:down` | sandbox 의 `db` 를 띄운다 / 내린다 |
| `pnpm sandbox:reset` | 이 머신의 production DB 를 sandbox DB 에 다시 복원하고 본문을 자리 표시자로 바꾼다(EC2 의 DB 를 읽는 것은 후속) |
| `pnpm db:up` (`db:down`, `db:status`) | sandbox DB 의 별칭 |

스크립트는 `infra/docker/scripts/` 에 있다.
