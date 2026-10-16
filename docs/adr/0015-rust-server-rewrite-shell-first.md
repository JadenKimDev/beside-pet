---
id: ADR-0015
date: 2026-10-16
status: accepted
tags: [rust, server, architecture, migration]
related: [ADR-0004, ADR-0005, ADR-0010]
---
# 서버는 axum 과 sqlx 로 다시 쓰되, 엔드포인트의 겉을 먼저 그대로 옮기고 기능의 속은 PRD 마다 포팅과 재설계 중에 고른다

## 맥락

NestJS API(`apps/api`)를 Rust 로 옮기기로 했다(ADR-0010 의 결과). 처음 원칙은 "포팅은 동작을 바꾸지 않는다"였고, 기존 데이터(bcrypt 해시, TypeORM 마이그레이션 테이블)와의 호환이 그 이유였다. 그런데 2026-10-16 운영 자원을 모두 내려 실제 사용자 데이터가 있는 DB 가 없다. 호환은 제약이 아니라 선택이 됐다.

한편 대화 웹(`apps/web`)은 28개 경로와 그 요청·응답 모양, 오류 본문의 `message` 에 기대고 있다. 웹을 건드리지 않으려면 겉은 그대로여야 한다. 기능의 속(토큰 방식, 대화 흐름, 모델 호출)은 웹이 모르므로 바꿔도 된다.

## 결정

- **겉을 먼저, 전부.** 첫 PRD(#7)는 28개 경로, 요청 타입과 class-validator 와 같은 검증 문구, 응답 타입, 상태 코드, Nest 모양 오류 본문(`{ statusCode, message, error }`), 쿠키 인증 추출기, SSE 작성기를 한 번에 만든다. 핸들러는 기능의 trait 를 부르고, 구현이 없는 trait 는 `Unimplemented` 구조체가 `501 Not implemented` 를 낸다. health 와 safety 는 데이터뿐이라 바로 동작한다.
- **속은 기능마다 고른다.** 뒤의 PRD(계정과 인증, 모델과 안전, 대화)가 trait 를 채우며, 그때 기존 동작을 포팅할지 다시 설계할지 기능마다 고르고 ADR 로 남긴다. 겉(경로, 요청·응답 모양, 상태 코드, 오류 문구, 환경 변수 이름)은 그 뒤에도 바꾸지 않는다. 바꾸려면 웹과 함께 따로 PRD 로 다룬다.
- **크레이트.** axum 0.8(라우터, 추출기), sqlx 0.9(컴파일 시점 검사 없이 런타임 쿼리, 마이그레이션 내장), tokio, serde, tracing, tower-http(CORS). 모두 MIT 또는 Apache-2.0 이다.
- **가르기.** 기능 디렉터리(`identity`, `support`, `safety`, `llm`, `shared`)와 방향(`support → identity`, `support → safety`, `support → llm`, 모두 → `shared`)을 두고, 다른 기능이 쓰는 것은 그 기능 `mod.rs` 의 `pub` 뿐이다. 환경 변수는 `shared/config.rs` 만 읽는다. 흐름이 바깥(DB, 모델, 시계)을 쓸 때는 trait 로 받고 `app.rs` 가 끼운다. 규칙은 `apps/server/CLAUDE.md` 에 있고 레포 검사가 내부 경로 `use` 와 `mod.rs` 의 자리를 실패로 잡는다.
- **기동 조건.** `DATABASE_URL` 이 없으면 뜨지 않는다. DB 를 쓰는 테스트도 없으면 이유를 적고 실패한다. 조용히 건너뛰는 모드를 두지 않는다(ADR-0010 의 "라이브 전용"과 같은 태도).

## 버린 것

| 안 | 이유 |
|---|---|
| actix-web | axum 이 tower 생태계(미들웨어, tower-http)와 바로 맞고 추출기 모양이 단순하다. 성능 차이는 이 서비스의 규모에서 뜻이 없다 |
| diesel | 동기 API 와 스키마 매크로가 "DB 에는 최소한의 사실만, 가공은 쿼리와 뷰로" 원칙과 잘 맞지 않는다. sqlx 는 SQL 을 그대로 쓴다 |
| sea-orm | ORM 층이 하나 더 생긴다. TypeORM 에서 벗어나는 김에 ORM 없이 간다 |
| 기능 하나씩 겉과 속을 같이 옮기기 | 웹이 보는 경로가 두 서버에 나뉘는 기간이 생긴다. 겉을 한 번에 만들면 전환(#11)이 서버 하나를 바꾸는 일이 된다 |
| 동작을 바꾸지 않는 포팅(처음 원칙) | 실제 데이터가 없으므로 호환을 지킬 이유가 없고, bcrypt 와 TypeORM 마이그레이션 표를 그대로 두면 Rust 쪽이 TS 의 선택에 묶인다 |
| 겉을 만들 때 기능까지 가짜로 채우기(메모리 저장 등) | 501 이 "아직 없음"을 분명히 말한다. 가짜 구현은 테스트와 웹을 속인다 |

## 결과

- `apps/api` 는 전환(#11)까지 그대로 두고 바꾸지 않는다. 두 서버가 같은 DB 스키마에서 출발하도록 Rust 의 첫 마이그레이션은 TypeORM 초기 스키마와 같은 DDL 이다. 기능 PRD 가 스키마를 바꾸기로 하면 다음 마이그레이션으로 더한다.
- 루트 `CLAUDE.md` 의 "제품 원칙"은 이 결정대로 고친다.
- 통합 테스트(`apps/server/tests/`)가 28개 경로의 겉을 고정한다. 기능 PRD 가 trait 를 채워도 그 테스트는 그대로 통과해야 한다.

## 근거

- `docs/prd/7-rust-server-endpoints.md`(로컬 캐시, 정본은 이슈 #7), 이슈 #8~#11.
- `apps/web/lib/http/client.ts` 가 오류 본문의 `message` 만 읽는다.
- 2026-10-16 운영 자원 내림(루트 `CLAUDE.md` "지키는 선").
