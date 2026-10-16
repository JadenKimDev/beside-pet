---
id: ADR-0017
date: 2026-10-16
status: accepted
tags: [rust, server, auth, identity, security]
related: [ADR-0007, ADR-0015]
---
# Rust 서버의 identity 는 비밀번호 해시만 argon2id 로 다시 설계하고, JWT 와 setup 토큰, 가입 승인, 계정 상태와 만료는 TS 그대로 옮긴다

## 맥락

ADR-0015 는 겉(경로, 요청·응답, 상태 코드, 오류 문구, 환경 변수 이름)을 먼저 옮기고 기능의 속은 PRD 마다 포팅과 재설계 중에 고르라고 했다. #8 이 identity 의 속을 채운다. 2026-10-16 운영 자원을 내려 실제 사용자 데이터가 있는 DB 가 없으므로, 기존 bcrypt 해시나 발급된 토큰과의 호환은 제약이 아니다.

대화 웹은 쿠키 `beside-pet.token` 과 오류 본문의 `message` 에 기댄다. 가드는 ADR-0007 대로 매 요청 계정을 DB 에서 다시 읽어 상태와 만료를 본다.

## 결정

| 항목 | 선택 | 이유 |
|---|---|---|
| 비밀번호 해시 | 다시 설계: argon2id(크레이트 기본값 m=19 MiB, t=2, p=1, PHC 문자열) | 호환할 해시가 없고, 메모리 경도가 있는 쪽을 고른다. 해시와 확인은 `spawn_blocking` 으로 돈다 |
| 로그인 토큰 | 포팅: JWT HS256 `{ sub, role, iat, exp }`, `JWT_SECRET`, `JWT_TTL` | 가드가 매 요청 계정을 다시 보므로 정지·삭제·만료는 이미 곧바로 듣는다. 웹과 환경 변수를 그대로 둔다 |
| 첫 관리자 | 포팅: 관리자가 없으면 기동 로그에 1회용 setup 토큰(16바이트 hex)을 찍고, 상수 시간 비교로 한 번만 바꿔 준다 | 비밀 값을 env 파일에 두지 않는다 |
| 가입 | 포팅: 신청 → `pending` → 관리자 승인 | 초대 단계의 운영 방식 그대로다 |
| 계정 상태와 만료 | 포팅: `active`, `pending`, `revoked`, `deleted`, 절대 만료 시각 | 같다 |

오류 문구와 상태 코드는 TS 의 유스케이스와 가드를 그대로 옮긴다(`401 Invalid username or password` 는 아이디 없음과 비밀번호 틀림이 같은 문구, `403 Your account is awaiting approval.`, `401 Account is revoked`, `401 Account is unavailable`, `401 Account has expired`, `409 Setup is already complete`, `403 Invalid setup token`, `409 Username already exists: <name>`, `404 Account not found: <id>`).

작은 결정:

- **`JWT_TTL` 의 단위 없는 숫자는 초다.** TS 는 `jsonwebtoken` 의 `expiresIn` 에 글을 넘기고, 그 안의 `ms` 라이브러리는 단위 없는 숫자 글을 밀리초로 읽는다. 그래서 `JWT_TTL=3600` 은 3.6초짜리 토큰이 되어 사실상 곧바로 만료된다. 이 함정은 따르지 않는다. 단위가 붙은 글(`7d`, `12h`, `30m`)은 같다. 기동 로그에 실제로 쓰는 수명(초)을 남긴다. 읽지 못하는 글이면 기동하지 않는다.
- **`JWT_SECRET` 의 기본값은 production 에 없다.** 개발에서는 TS 와 같은 `dev-insecure-secret-change-me` 를 쓰고, `NODE_ENV=production` 에서 비어 있으면 기동하지 않는다(오류에는 이름만 싣는다).
- **계정 목록의 순서는 `created_at, id` 로 고정한다.** TS 는 순서를 정하지 않았다.
- **setup 은 관리자를 만들고 곧바로 로그인한 결과를 준다.** TS 는 setup 뒤 로그인 유스케이스를 다시 불렀다. 결과(`last_login_at` 이 찍힌 계정과 토큰)는 같다. setup 의 아이디가 이미 신청된 아이디면 `409 Username already exists: <name>` 이다(TS 는 이 경우를 따로 보지 않았다).
- **계정 id 는 uuid v4 다**(TS 의 `randomUUID` 와 같은 모양).

## 버린 것

| 안 | 이유 |
|---|---|
| bcrypt 10 라운드 그대로 | 지킬 기존 해시가 없다. 같은 비용이면 argon2id 가 GPU 공격에 더 버틴다 |
| 불투명 세션 토큰을 DB 에 해시로 저장 | 곧바로 폐기하는 이점은 매 요청 계정을 다시 읽는 가드가 이미 준다. 세션 테이블과 정리 작업이 늘고, `JWT_*` 의 뜻이 바뀌어 운영 설정과 어긋난다 |
| `JWT_TTL` 을 TS(`ms`)처럼 밀리초로 읽기 | 단위 없는 숫자가 사실상 즉시 만료가 되는 함정을 옮기게 된다 |

## 결과

- `AppState::connect` 가 기동 때 `IdentityService` 를 만들어 `accounts` 와 `authenticator` 에 끼운다. 관리자가 있는지 보지 못하거나 `JWT_TTL` 을 읽지 못하면 서버가 뜨지 않는다.
- setup 토큰은 프로세스 메모리에만 있다. 교환하지 않고 서버를 다시 띄우면 새 토큰이 찍힌다. setup 이 아이디 충돌로 실패해도 토큰은 이미 쓴 것이므로, 서버를 다시 띄워 새 토큰을 받는다.
- 비밀번호 원문과 토큰 원문은 DB 와 로그에 두지 않는다. 기동 로그의 setup 토큰 두 줄만 예외다.
- 운영의 `JWT_TTL` 에 단위 없는 숫자를 썼다면 TS 와 뜻이 다르다(초). 전환(#11) 때 운영 설정을 단위가 붙은 글로 둔다.
