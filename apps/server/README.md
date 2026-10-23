# Beside Pet 서버 (beside-pet-server)

반려동물을 떠나보낸 보호자를 위한 감정 지원(emotional support) 대화의 API 서버다. Rust(axum, sqlx)와 PostgreSQL 로 돌고, 대화 웹(`apps/web`)이 부르는 유일한 창구다. 모델의 키와 설정은 서버에만 있고 화면에 내보내지 않는다(ADR-0016).

이 영역을 고칠 때의 규칙(기능 가르기, 기능 사이의 방향, 환경 변수를 읽는 자리, 오류 본문의 모양, 시각 형식)은 [`CLAUDE.md`](CLAUDE.md) 에 있다. 여기서는 되풀이하지 않는다. 결정의 이유는 `docs/adr/` 에 있고 `pnpm docs:search "<낱말>"` 로 찾는다.

## 띄우기

환경은 둘이고 `APP_ENV`(`production` | `sandbox`)가 고른다. `APP_ENV` 가 없거나 다른 값이면 서버는 기동하지 않는다. `NODE_ENV` 는 읽지 않는다.

| 환경 | 쓰임 | 설정 파일 | 듣는 주소 |
|---|---|---|---|
| `production` | 실제로 쓰는 환경. 지금은 이 머신의 Docker 에 띄운다(`pnpm prod:up`) | `.env.production` | 모든 주소(0.0.0.0). `JWT_SECRET` 필수 |
| `sandbox` | 개발, 테스트, 실측. DB 는 production 을 복사해 본문을 지운 것(`pnpm sandbox:reset`) | `.env.sandbox` | 두 루프백(127.0.0.1, ::1) |

```bash
pnpm sandbox:up                                       # sandbox PostgreSQL (127.0.0.1:${DB_PORT:-5433}). pnpm db:up 도 같다
cp apps/server/.env.example apps/server/.env.sandbox  # 처음 한 번. DATABASE_URL 과 모델 설정을 채운다
pnpm dev                                              # APP_ENV=sandbox 로 서버(127.0.0.1:3000)와 대화 웹(127.0.0.1:3001)을 함께
curl 127.0.0.1:3000/v1/health                         # {"status":"ok"}
```

- 설정 파일은 `APP_ENV` 가 고른 `.env.<APP_ENV>` 하나다. 띄운 디렉터리(레포 루트)에서 먼저 찾고 없으면 `apps/server/` 에서 찾는다. 파일 이름을 `APP_ENV` 가 정하므로 `APP_ENV` 는 프로세스 환경에서만 읽는다. 이미 프로세스 환경에 있는 값은 파일이 덮지 않고, 파일이 없으면 프로세스 환경만 쓴다. 읽는 이름은 [`.env.example`](.env.example) 에 모두 있다.
- DB 포트는 `DB_PORT` 로 바꿀 수 있다. 바꾸면 `DATABASE_URL` 의 포트도 맞춘다.
- `pnpm dev` 는 `dev-tools/scripts/dev.sh` 다. 3000 이나 3001 을 이미 누가 듣고 있으면 그 프로세스를 보이고 멈추며(대신 내리지 않는다), 서버와 웹 중 하나가 끝나거나 Ctrl-C 를 누르면 둘 다 내린다. 설정 파일도 `DATABASE_URL` 도 없으면 만드는 법을 알리고 멈춘다.
- 서버만 띄울 때는 `APP_ENV=sandbox dev-tools/scripts/cargo.sh run -p beside-pet-server` 다. 이 머신의 PATH 에는 cargo 가 없어 래퍼로 부른다.
- 화면은 루프백(127.0.0.1)에만 연다.

기동할 때 서버는 `DATABASE_URL` 에 붙어 `migrations/` 의 마이그레이션을 돌린다. `DATABASE_URL` 이 없거나 붙지 못하면 기동하지 않는다. 대화 기록이 제품의 실체라, DB 없이 조용히 돌기보다 처음부터 분명하게 실패한다.

관리자 계정이 아직 없으면 기동 로그에 1회용 setup 토큰이 찍힌다. 그 토큰으로 `POST /v1/auth/setup` 을 불러 첫 관리자를 만든다. 자격 증명이 파일 어디에도 남지 않게 하려는 것이다(ADR-0007).

## 테스트

```bash
pnpm test:stack    # clippy(-D warnings)와 cargo test
pnpm test          # biome, 전 워크스페이스, 레포 검사, 그리고 test:stack
```

`cargo test` 는 DB 테스트를 품으므로 sandbox DB 가 떠 있어야 한다. 주소는 환경의 `DATABASE_URL`, 없으면 `apps/server/.env.sandbox` 의 것을 쓴다. 없으면 이유를 적고 실패한다(건너뛰지 않는다). 테스트 하나만 돌릴 때 필터 여럿은 `--` 뒤에 둔다.

## 컨테이너

```bash
pnpm prod:up       # production 의 db, api, web 을 Docker 에 (프로젝트 beside-production, --profile full)
curl 127.0.0.1:8000/v1/health
pnpm prod:down
```

- compose 파일은 `infra/docker/compose.yaml` 하나이고 프로젝트 이름으로 두 환경을 가른다(`beside-production`, `beside-sandbox`). 서비스와 포트는 [`infra/docker/README.md`](../../infra/docker/README.md) 에 있다.
- 컨테이너의 서버는 `APP_ENV=production` 이다. `APP_ENV`, `PORT`, `DATABASE_URL`(compose 안의 `db`), `COOKIE_SECURE`(기본 `false`)는 compose 가 고정하고, 나머지(`JWT_SECRET`, `LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` 등)는 `env_file` 로 `apps/server/.env.production` 에서 받는다. 비밀 값은 compose 파일에 쓰지 않는다.
- 로그인 쿠키의 `Secure` 는 `COOKIE_SECURE` 가 정하고, 없으면 `APP_ENV=production` 일 때 붙는다. compose 는 http 루프백에서 로그인이 유지되도록 `COOKIE_SECURE=false` 를 둔다. HTTPS 앞단 뒤에 올릴 때는 이 값을 빼거나 `true` 로 둔다.

## 엔드포인트

모두 `/v1` 아래다. 겉(경로, 요청과 응답의 모양, 상태 코드, 오류 문구)은 옛 TS API 의 것을 그대로 가진다(ADR-0015).

| 영역 | 경로 | 용도 |
|---|---|---|
| health | `GET /v1/health` | 살아 있는지 |
| auth | `GET·POST /v1/auth/setup`, `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me`, `PATCH /v1/auth/me/chat-language` | 첫 관리자(1회용 토큰), 계정 신청(승인제), JWT httpOnly 쿠키 로그인, 계정의 대화 언어 |
| admin | `/v1/admin/accounts`, `/{id}/approve`·`revoke`·`soft-delete`·`reactivate`·`expiry`, `DELETE /{id}` | 계정 발급, 신청 승인, 회수, 만료 |
| sessions | `POST·GET /v1/sessions`(+ `POST /stream`), `GET·DELETE /{id}`, `POST·GET /{id}/messages`(+ `POST /stream`), `POST /{id}/close`, `GET /{id}/analysis`, `GET /{id}/report` | 대화 시작, 사용자 턴, 닫기, 삭제, 목록과 상태와 전사, 턴 분석, 마음 리포트 |
| safety | `GET /v1/safety/resources` | 위기 지원 자원. 늘 무료, 늘 보인다 |

스트리밍은 SSE 이고 `meta` → `token`* → `done` 순서다. 위기 턴도 `meta` 뒤에 고정 문구를 토큰 하나로 보낸다. 오류 본문은 `{ statusCode, message, error }` 다(`CLAUDE.md`).

## 설계 의도

### 흐름은 코드가, 발화는 모델이

동반 대화의 흐름을 모델의 자율 판단에 맡기면 같은 질문을 되풀이하거나 같은 자리를 맴돌기 쉽다. 그래서 "다음에 무엇을 할지"는 그래프 프레임워크가 아니라 평범한 코드의 흐름(`src/support/flow/`)이 정하고, 모델은 각 단계 안에서 공감하는 발화만 쓴다. 전이 규칙이 그대로 읽히는 규칙 코드가 되어 디버깅, 테스트, 교체가 단순해진다(ADR-0005). 한 턴은 이렇다.

```
안전 확인 → 과제 전이 판단 → 지식 검색 → 발화 생성 → 턴 분석 → 저장
```

### 이론에 기댄 단계와 깊이 게이트

흐름의 골격은 애도 이론에서 가져왔다. Worden 의 애도 4과제(상실의 현실 받아들이기, 슬픔의 감정 마주하기, 없는 일상에 적응하기, 연결을 간직하며 나아가기)가 과제(0 온보딩 ~ 5 클로징)이고, 과제 기반이라 완수 여부를 판정할 수 있어 진행률을 (과제−1)/4 로 셀 수 있다. 이중과정모델(상실 지향과 회복 지향을 오간다), 지속적 유대(잊기가 아니라 건강한 연결), 박탈된 슬픔(그래서 첫 단계가 진단이 아니라 "그 슬픔은 정당하다"는 검증이다)이 단계의 내용을 받친다. 온보딩은 급성 경로(이미 떠나보냄)와 예기 경로(이별을 앞둠)로 갈린다.

과제 전이는 전사에서 결정론적으로 구한다. 따로 세는 칸을 저장하지 않는다.

```
과제마다 최소 3턴 머문 뒤 진솔한 답                → 다음 과제
"모르겠어요" 같은 비몰입이 2번 잇따름              → 부드러운 조기 전이(강요하지 않는다)
어떤 경우에도 5턴                                   → 상한 전이(반드시 빠져나간다)
위기 신호                                           → 즉시 안내하고 닫는다
```

비몰입을 미완료로 보고 같은 질문을 되묻는 맴돌이를 조기 전이가 막고, 몰입하면 한 겹씩 깊어지는 후속 질문을 주며, 상한이 있어 어떤 길로도 빠져나간다. 모든 질문은 건너뛸 수 있다.

### 안전

모든 턴은 발화를 만들기 **전에** 위기를 판정한다. 판정은 키워드 ∪ 모델(언어 무관)이고, 어느 쪽이든 걸리면 위기다(오탐 쪽으로 보수적이다). 위기면 발화 모델을 부르지 않고 고정 안내 문구(모델이 쓰지 않는다)로 전문 자원과 헬프라인에 잇고 세션을 닫는다. 지원 수준(1 안정, 2 주의, 3 위기)은 내려가지 않는다. 판정 모델이 실패하거나 시간을 넘기면 키워드 결과로 대신한다(ADR-0004). 위기 자원 안내는 유료화하지 않는다. 규칙의 자리와 바꿀 때의 절차는 `CLAUDE.md` 에 있다.

### 세션 잇기와 마음 리포트

- 열린 세션에 다시 들어오면 전사와 진행 상태가 그대로 돌아온다.
- 새 대화는 온보딩을 다시 거치지 않는다. 직전 세션의 애도 프로필과 도달 과제를 이어받고(클로징이었으면 과제 1), 직전 세션의 요약과 전사 꼬리를 재개 인사의 프롬프트에 넣어 지난 이야기를 이어 말한다.
- 마음 리포트는 닫힌 세션의 회고(4절)다. 닫혔고 최소 한 과제를 마쳐야 열리며, 모델이 한 번 쓰고 고치지 않는다(ADR-0008). 내부 분석(지지 계획, 감독, 턴 분석)과는 따로 된 사용자용 표면이다.
- 대화 삭제는 전사, 턴 분석, 리포트를 함께 지운다(ADR-0006).

### 분석 레이어

턴 흐름 밖에서 세 역할이 분석을 더한다. 지지 계획(Planner, 애도 프로필에서 경로별 초점과 주의점), 감독(Supervisor, 과제 전이·지원 수준 상승·샘플링 때만 발화를 점검), 종료 요약(Summarizer)이다. 지금은 셋 다 규칙이고(`src/support/rules/`), 계획과 요약은 같은 입력에서 늘 같은 값이 나오는 파생값이라 저장하지 않고 응답할 때 다시 구한다(ADR-0018). 지식 검색(RAG)은 `rag-knowledge/grief-knowledge.json` 을 기동 때 읽어 과제마다 두 개를 고른다(ADR-0014).

### 저장

일어난 일만 행으로 둔다(ADR-0018). 전사는 `messages` 행, 턴 분석은 `turn_analyses` 행, 마음 리포트는 모델이 쓴 사실이라 `sessions.report` 에 둔다. 단계 도달률과 턴 수는 이 행들에서 SQL 로 센다.

### 모델

모든 모델 호출은 `llm` 의 `TextModel` 관문 하나를 지나고, 요청마다 공급자와 모델을 함께 싣는다. 공급자는 Anthropic(production)과 Claude Code(개발·실측, 이 머신의 `claude -p` 를 구독으로 띄운다)이고 기본 공급자의 설정만 필수다(ADR-0038, `.env.example`). 대화가 부르는 모든 호출에는 시간 제한이 있다(생성 전체 120초, 스트림 조각 사이 60초, ADR-0018). 관측(예: Langfuse)을 붙일 때도 이 관문 하나에 얹으면 된다. 모델의 실패는 오류로 올리고, 위기 판정만 키워드로 대신한다.

### 인증

JWT 를 httpOnly 쿠키로 주어 토큰이 화면의 스크립트에 드러나지 않는다. 매 요청 계정 상태를 다시 확인해 정지와 만료가 바로 듣는다. 가입은 승인제다: 공개 신청(`register`) → `pending` → 관리자 승인 뒤 로그인(ADR-0007).
