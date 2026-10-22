# apps/backoffice

운영자용 화면(Next.js App Router)이다. 운영자는 제품 사용자가 아니므로 대화 웹의 머리·바닥, i18n, 테마 규칙은 적용하지 않는다. 화면 글은 한국어만이다.

## 규칙

- **본문을 보이지 않는다.** 대화 본문, 리포트, 추모 편지는 어느 화면에도 싣지 않는다(루트 `CLAUDE.md` "읽지 않는 것", ADR-0006). 계정은 상태와 활동 수로만 본다. 위기 대응 때의 열람(break-glass)은 따로 정한다.
- **서버의 관리자 API 만 쓴다.** `/v1/admin/*` 과 `/v1/auth/*` 뿐이고, 서버의 겉을 이 앱 때문에 바꾸지 않는다(ADR-0015). 판정은 서버다(관리자가 아니면 `403 Insufficient role`). 화면의 관리자 가드는 편의다.
- **GitHub 토큰은 Next 서버에만 있고 이슈는 DB 에 복사하지 않는다.** 개발노트 화면은 Next 의 Route Handler(`app/api/github/`)가 `GITHUB_TOKEN` 으로 GitHub 를 대신 부른 것을 보인다. 토큰은 `NEXT_PUBLIC_` 으로 두지 않고, 이슈·보드·댓글은 메모리 캐시(60초)만 거치며 DB 와 서버의 관리자 API 에는 들어가지 않는다. 정본은 GitHub 이슈 하나다.
- **브라우저는 API 를 직접 부르지 않는다.** 늘 같은 출처의 `/v1/...` 을 부르고 `next.config.ts` 의 `rewrites` 가 `API_BASE_URL` 로 넘긴다. 인증 쿠키가 `SameSite=Lax` 라 다른 사이트로는 가지 않기 때문이다(ADR-0024). `API_BASE_URL` 은 서버 쪽 값이라 `NEXT_PUBLIC_` 으로 두지 않고, rewrites 는 빌드 때 굳으므로 Docker 이미지에서는 빌드 인자다.
- **이 머신에서만 띄운다.** EC2 와 CloudFront 에 올리지 않는다. 올리려면 인증 앞단을 먼저 정한다.
- **Route Handler 가 로컬 프로세스를 띄우는 것은 `src/shared/claude/` 의 닫힌 목록뿐이다.** `claude -p`(PRD 쓰기, 구독), 작업 대장 CLI(`pnpm prd:push`, `pnpm ledger:new`, `pnpm wt:create`), 그 사이의 `git add`·`git commit`·`git push origin main` 만이다(ADR-0035). 사용자의 글은 `claude -p` 의 인자 배열 원소 하나로만 가고 셸 문자열에 끼우지 않는다(`shell: false`). 파일 인자는 `docs/prd/` 아래의 파일 이름만 받고 `..` 와 경로 구분자는 거른다. 자식 프로세스의 env 에서 `CLAUDECODE`, `CLAUDE_CODE_*`, `GITHUB_TOKEN` 을 뺀다. 이슈로 올리는 명령은 모델이 아니라 화면의 버튼이 돌린다. 이 기능 때문에도 운영 화면은 이 머신 밖에 올리지 않고, 올려야 하면 `app/api/prd-chat/` 을 먼저 뺀다.
- **색은 토큰으로만 쓴다.** 색 값은 `apps/backoffice/app/globals.css` 에만 두고 컴포넌트는 토큰 클래스를 쓴다. `src/app/styles/color-literals.test.ts` 가 이것을 본다.
- **글자 리터럴은 `views` 와 `widgets` 에만 둔다.** `shared/ui` 는 글자를 품지 않고 문구를 props 로 받는다. 엔티티의 상태 라벨처럼 개체에 붙은 글자는 그 엔티티의 `model/` 에 모은다.

## Feature-Sliced Design

`apps/backoffice/src/` 아래 여섯 레이어다. 레포 검사(`packages/dev-checks/src/fsd-layers.ts`)가 아래 세 규칙을 보고, 걸리면 `pnpm test` 가 실패한다.

| 레이어 | 뜻 |
|---|---|
| `app` | 전역: 프로바이더, 전역 스타일 |
| `views` | 라우트 하나가 그리는 화면(FSD 의 `pages`. Next 의 `pages/` 와 이름이 부딪혀 `views`) |
| `widgets` | 여러 기능과 엔티티를 묶은 독립 블록 |
| `features` | 사용자가 하는 행동 하나 |
| `entities` | 업무 개체: 타입, API 호출, 작은 표시 |
| `shared` | 업무와 무관한 공통: 전송, UI 조각, 도우미, 설정 |

1. **위가 아래만 가져온다.** `app > views > widgets > features > entities > shared`.
2. **같은 레이어의 슬라이스끼리 가져오지 않는다.** `app` 과 `shared` 는 슬라이스가 없는 레이어라 세그먼트끼리는 된다.
3. **슬라이스 밖에서는 그 슬라이스의 `index.ts` 만 가져온다.** `@/entities/account` 는 되고 `@/entities/account/model/types` 는 안 된다. `shared` 와 `app` 은 세그먼트가 공개 단위다(`@/shared/api`). 스타일과 그림 같은 모듈이 아닌 파일은 예외다.

슬라이스 안의 세그먼트는 `ui/`, `model/`, `api/`, `lib/` 다. 별칭 `@/` 는 `src/` 를 가리킨다. Next 의 라우트 파일(`apps/backoffice/app/`)은 `views` 와 `app` 의 것을 돌려주는 한두 줄이고 레이어 `app` 과 같게 본다.

## 테스트 방침

- 테스트는 실제로 깨지는 것에만 둔다: 엔티티의 순수 계산(거르기, 합산, 빈 날 채우기), API 호출의 경로와 본문, 전송의 오류 추출과 401·403 구분, 기능의 상태 전환, 색 리터럴.
- 순수 표시 컴포넌트와 스냅샷 테스트는 두지 않는다. 화면 확인은 QA 가 한다.
