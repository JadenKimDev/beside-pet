# apps/backoffice

운영자용 화면(Next.js App Router). 모델 계측, 대화 집계, 계정 관리, 개발노트(GitHub 이슈와 보드의 읽기 전용 보기)를 한다. 서버의 관리자 API(`/v1/admin/*`, `/v1/auth/*`)만 부르고, 대화 본문·리포트·추모 편지는 보이지 않는다. 구조는 Feature-Sliced Design 이다(`CLAUDE.md`, ADR-0024). 당분간 이 머신에서만 띄우고 클라우드에 올리지 않는다.

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

## `GITHUB_TOKEN`(개발노트)

개발노트 화면은 이 레포의 GitHub 이슈(PRD 의 정본)와 프로젝트 보드(`project.config.json` 의 `repo`, `boardNumber`)를 읽기 전용으로 보인다. GitHub 호출은 브라우저가 아니라 Next 의 Route Handler(`app/api/github/`)가 하고, 토큰은 서버 쪽 환경 변수 `GITHUB_TOKEN` 이다. fine-grained 토큰으로 이 레포의 Issues 읽기·쓰기(라벨 `run:implement` 를 붙이는 "구현 시작" 버튼 때문)와 Projects 읽기만 준다. 값이 없으면 개발노트 화면만 "토큰이 없다" 안내를 보이고 다른 화면은 그대로다. 이슈는 DB 에 복사하지 않고 메모리에 60초만 캐시한다.

## 검사

```bash
pnpm -F @beside-pet/backoffice typecheck
pnpm -F @beside-pet/backoffice test
pnpm test                                 # 레포 검사가 FSD 레이어 방향과 슬라이스 공개 API 도 본다
```
