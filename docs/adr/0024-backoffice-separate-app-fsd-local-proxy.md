---
id: ADR-0024
date: 2026-10-21
status: accepted
tags: [backoffice, admin, web, fsd, architecture, privacy, auth, cookie]
related: [ADR-0006, ADR-0007, ADR-0015, ADR-0017, ADR-0021, ADR-0022, ADR-0023]
---
# 운영 화면은 대화 웹과 다른 앱이고 본문을 보이지 않는다. 구조는 FSD 이고 레이어 방향을 레포 검사가 지킨다. 당분간 이 머신에서만 띄우고 API 는 Next 서버가 대신 부른다

## 맥락

계정 발급·승인·정지는 대화 웹의 `/admin` 에 붙어 있었다. 사용자에게 나가는 앱에 운영자의 화면과 그 코드가 같이 실려 있고, 머리·바닥의 예외(`chrome.ts` 의 `/admin` 행)와 i18n 키가 제품 코드에 섞인다. #4 가 모델 호출 기록과 관리자 계측 API(`GET /v1/admin/metrics/models`, `/conversations`, ADR-0022)를 열면서 운영자가 볼 화면이 더 늘게 됐고, 앞으로 개발 자동화(이슈 작성, 진행 보기)의 자리도 필요하다.

서버의 인증은 httpOnly 쿠키이고 `SameSite=Lax` 다(ADR-0007, ADR-0017). 브라우저는 다른 사이트(예: `http://127.0.0.1:3002` 에서 CloudFront 도메인)로는 이 쿠키를 보내지 않는다. production 은 CloudFront 뒤의 EC2 한 대이고 커스텀 도메인은 없다(ADR-0023).

## 결정

- **운영 화면(backoffice)은 대화 웹과 다른 Next.js 앱이다(`apps/backoffice`).** 대화 웹에서 `/admin` 과 `features/admin/` 과 그 i18n 키와 chrome 행을 지운다. 사용자에게 나가는 앱에는 운영 화면을 두지 않는다. 데이터는 서버의 관리자 API(`/v1/admin/*`, `/v1/auth/*`)만 쓰고, 서버의 겉은 바꾸지 않는다(ADR-0015).
- **본문을 보이지 않는다.** 대화 본문, 리포트, 추모 편지는 어느 화면에도 싣지 않는다(ADR-0006, 루트 `CLAUDE.md` "읽지 않는 것"). 계정은 상태와 활동 수로만 본다. 위기 대응 때의 열람(break-glass)은 따로 정한다.
- **인증은 기존 쿠키 로그인 그대로이고, 판정은 서버다.** 관리자가 아니면 로그인 뒤 "권한이 없다" 화면을 보이지만, 막는 것은 서버의 관리자 추출기(`403 Insufficient role`)다. 화면 쪽 가드는 편의다.
- **구조는 Feature-Sliced Design 이고 레이어 방향을 레포 검사가 지킨다.** `src/` 아래 `app > views > widgets > features > entities > shared` 여섯 레이어. 위가 아래만 가져오고, 같은 레이어의 슬라이스끼리 가져오지 않으며, 슬라이스 밖에서는 그 슬라이스의 `index.ts` 만 가져온다(`shared` 는 세그먼트가 공개 단위). FSD 의 `pages` 는 Next 의 `pages/` 와 이름이 부딪혀 `views` 로 부른다. Next 의 라우트 파일(`app/**/page.tsx`)은 `views` 와 `app` 의 것을 돌려주는 한두 줄이다. 세 규칙은 `packages/dev-checks` 의 `fsd-layers` 가 잡고 `pnpm test` 가 실패한다. 서버의 `internal-use` 검사와 같은 자리다.
- **당분간 이 머신에서만 띄운다.** sandbox `127.0.0.1:3002`, 로컬 production(`pnpm prod:up`) `127.0.0.1:8002`. EC2 와 CloudFront 에 올리지 않는다.
- **API 는 backoffice 의 Next 서버가 대신 부른다.** 브라우저는 늘 같은 출처의 `/v1/...` 을 부르고 `next.config.ts` 의 `rewrites` 가 서버 쪽 환경 변수 `API_BASE_URL` 의 `/v1/...` 으로 넘긴다. 같은 출처가 되므로 `SameSite=Lax` 쿠키가 실리고 서버의 CORS 를 바꿀 필요가 없다. `API_BASE_URL` 은 브라우저에 노출하지 않으며 sandbox(3000), 로컬 production(8000), AWS 의 production(CloudFront 도메인) 어느 것이든 가리킬 수 있다.
- **화면 글은 한국어만이고 i18n 은 없다.** 운영자용이다. 다만 글자 리터럴은 `views` 와 `widgets` 에만 두고 `shared/ui` 는 글자를 품지 않는다. 색은 토큰으로만 쓴다(대화 웹과 같은 규칙).

## 버린 것

| 안 | 이유 |
|---|---|
| 대화 웹의 `/admin` 을 그대로 키움 | 운영 화면과 그 의존성(그래프 라이브러리)이 사용자용 번들에 섞이고, 머리·바닥·i18n 의 예외가 늘어난다 |
| 브라우저가 API 를 직접 부름(`NEXT_PUBLIC_API_BASE_URL`) | `SameSite=Lax` 쿠키가 다른 사이트로 가지 않아 CloudFront 의 production 을 볼 수 없다. 쿠키를 `None` 으로 바꾸면 서버의 겉과 보안 선이 움직인다 |
| 서버의 CORS 를 backoffice 출처에 맞게 고침 | 같은 출처로 만들면 필요 없다. CORS 가 origin 을 그대로 돌려주는 문제는 이 결정과 무관하므로 후속 PRD 로 뺀다 |
| backoffice 를 CloudFront 뒤에 같이 올림 | 운영자가 한 사람이고 이 머신에서 충분하다. 올리려면 인증 앞단(IP 제한 또는 추가 인증)이 먼저 필요하다 |
| 폴더 구조를 대화 웹처럼 `features/` 평면으로 둠 | 개발 자동화 화면이 더해지면 경계가 무너진다. FSD 의 레이어 방향은 기계적으로 검사할 수 있다 |
| ESLint 의 FSD 플러그인(`eslint-plugin-boundaries` 등) | 레포는 biome 을 쓰고 ESLint 가 없다. 세 규칙은 순수 함수 하나로 충분하고 기존 레포 검사 자리에 놓인다 |

## 결과

- `pnpm dev` 가 backoffice(3002)도 띄우고, compose 의 `full` 프로필에 `backoffice`(8002)가 더해진다.
- 대화 웹에 `/admin` 경로가 없다. `apps/web/CLAUDE.md` "공개 경로"의 관리자 화면 문장이 빠진다.
- 후속: 서버 CORS 의 origin 반사, 위기 대응 열람(break-glass), backoffice 를 이 머신 밖에 올리는 것, 개발 자동화 화면.

## 근거

- PRD #5(2026-10-21 판), ADR-0007(쿠키 `SameSite=Lax`), ADR-0022(관리자 계측 API 의 응답 모양), ADR-0023(production 의 주소가 CloudFront 기본 도메인).
