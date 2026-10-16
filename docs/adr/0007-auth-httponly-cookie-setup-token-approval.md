---
id: ADR-0007
date: 2026-10-16
status: accepted
tags: [auth, security, identity, api]
related: [ADR-0006, ADR-0009]
---
# 로그인은 httpOnly 쿠키의 JWT 로 하고, 첫 관리자는 부팅 로그의 1회용 토큰으로 만들며, 가입은 관리자 승인제다

## 맥락

모바일 시기에는 인증이 두 번 바뀌었다. 처음 문서는 Supabase Auth 였고, 코드는 Firebase Auth(Google, Apple 로그인)로 옮겨 갔는데 문서가 따라오지 못했다(DEV-2026-03-13-doc-code-mismatch). 웹 제품은 외부 인증 서비스 없이 자체 계정으로 다시 만들었다. 공개 서비스라기보다 초대한 사람만 쓰는 단계였고, 관리자가 계정을 발급하고 정지하고 만료시켜야 했다.

## 결정

- **토큰은 httpOnly 쿠키에만 둔다.** 쿠키 이름 `beside-pet.token`, httpOnly, SameSite lax, 7일. 토큰이 브라우저 JS 에 드러나지 않는다. 비밀번호는 bcrypt 해시로 저장한다.
- **가드가 매 요청 계정 상태를 다시 본다.** 정지, 만료, 삭제가 다음 요청부터 바로 반영된다. 토큰을 따로 폐기하지 않아도 된다.
- **첫 관리자는 1회용 setup 토큰으로 만든다.** 서버는 기동할 때 토큰을 로그에 찍고, `POST /v1/auth/setup` 이 그 토큰으로 첫 관리자를 만든다. 관리자 자격증명을 환경 변수나 파일에 두지 않는다.
- **가입은 승인제다.** 공개 신청(`register`)은 `pending` 계정을 만들고, 관리자가 승인한 뒤에 로그인할 수 있다. 관리자는 계정 발급, 승인, 정지, 재개, 만료 설정, 삭제를 한다.
- **한 도메인으로 묶는다.** 운영에서는 CloudFront 가 `/v1/*` 를 API 로, 나머지를 웹으로 보내 쿠키와 CORS 문제를 피했다.

## 버린 것

| 안 | 이유 |
|---|---|
| Firebase Auth(모바일 시기) | 모바일 앱과 함께 접었다. 웹에서 외부 인증 서비스와 그 계정을 다시 둘 이유가 없었다 |
| Supabase Auth(초기 문서) | 코드에서 이미 Firebase 로 바뀌었던 안이다 |
| 토큰을 localStorage 에 두고 Authorization 헤더 | XSS 에 토큰이 드러난다 |
| 첫 관리자를 환경 변수의 아이디와 비밀번호로 시드 | 자격증명이 파일과 비밀 저장소에 남는다 |
| 누구나 가입 | 운영 초기에 비용(LLM 호출)과 위기 대응을 감당할 범위를 넘는다. 공개 `register` 의 레이트리밋도 아직 없다 |

## 결과

- Rust 포팅은 쿠키 이름과 속성, JWT 서명(기존 토큰과 호환), bcrypt 해시 호환, 기동 때 setup 토큰을 찍는 동작을 그대로 지킨다.
- 쿠키의 Secure 속성은 `NODE_ENV` 가 production 일 때만 켜진다. 옛 운영 환경은 `SECURE_COOKIES` 를 따로 넣었지만 코드는 그 값을 읽지 않았다. 다시 운영할 때 둘 중 무엇이 기준인지 확인한다.
- 레이트리밋과 JWT 거부 목록(Redis)은 로드맵에만 있다.

## 근거

- `apps/api/src/identity/guard/cookie.ts`, `apps/api/src/identity/guard/jwt-auth.guard.ts`, `apps/api/src/identity/infrastructure/admin-setup.ts`, `apps/api/src/identity/application/register-account.usecase.ts`, `apps/api/src/identity/application/approve-account.usecase.ts`.
- `apps/api/docs/ARCHITECTURE.md` 9절, `apps/api/docs/02-architecture.md` 8절.
- `docs/research/2026-10-16-deploy-analysis.md` 의 "API 런타임", "Rust 포팅이 지킬 계약".
- 모바일 시기: `docs/research/legacy/v3/문서_코드_불일치_분석_리포트.md` C-1.
