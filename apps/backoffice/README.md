# apps/backoffice

운영자용 화면(Next.js App Router). 모델 계측, 대화 집계, 계정 관리를 한다. 서버의 관리자 API(`/v1/admin/*`, `/v1/auth/*`)만 부르고, 대화 본문·리포트·추모 편지는 보이지 않는다. 구조는 Feature-Sliced Design 이다(`CLAUDE.md`, ADR-0024). 당분간 이 머신에서만 띄우고 클라우드에 올리지 않는다.

## 띄우기

```bash
pnpm dev                                  # sandbox: 서버 3000, 대화 웹 3001, 운영 화면 http://127.0.0.1:3002
pnpm -F @beside-pet/backoffice dev        # 운영 화면만 (API 는 .env 의 API_BASE_URL)
pnpm prod:up                              # 로컬 production: 운영 화면 http://127.0.0.1:8002 (서버 8000)
```

관리자 역할의 계정으로 로그인한다. 관리자가 아니면 "권한이 없다" 화면이 보인다.

## `API_BASE_URL`

브라우저는 늘 같은 출처의 `/v1/...` 을 부르고, `next.config.ts` 의 `rewrites` 가 그것을 `API_BASE_URL` 의 `/v1/...` 로 넘긴다. 인증 쿠키가 `SameSite=Lax` 라 브라우저가 다른 사이트의 API 를 직접 부르면 쿠키가 실리지 않기 때문이다. 값은 서버 쪽이라 브라우저 번들에 들어가지 않는다.

| 보려는 API | `API_BASE_URL` |
|---|---|
| sandbox(`pnpm dev` 의 Rust 서버, 기본값) | `http://127.0.0.1:3000` |
| 이 머신의 production(`pnpm prod:up`) | `http://127.0.0.1:8000` |
| AWS 의 production | `https://<CloudFront 기본 도메인>.cloudfront.net` |

```bash
cp apps/backoffice/.env.example apps/backoffice/.env   # 값을 바꾼다
```

rewrites 는 `next dev` 와 `next build` 때 읽힌다. `pnpm dev` 는 다시 띄우면 바뀌고, Docker 이미지는 빌드 인자 `API_BASE_URL` 로 받아 굳으므로 다른 API 를 보려면 다시 빌드한다(`Dockerfile` 머리 주석).

## 검사

```bash
pnpm -F @beside-pet/backoffice typecheck
pnpm -F @beside-pet/backoffice test
pnpm test                                 # 레포 검사가 FSD 레이어 방향과 슬라이스 공개 API 도 본다
```
