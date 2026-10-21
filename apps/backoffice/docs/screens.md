# backoffice 화면 안 (#5 S4)

운영자가 보는 화면 다섯(로그인, 권한 없음, 모델 계측, 대화, 계정)과 껍데기의 구성이다. S7(모델·대화)과 S8(껍데기·계정·로그인·권한 없음)이 이 문서를 보고 구현한다. 슬라이스 이름은 PRD 의 "Feature-Sliced Design" 표를 따르고, `shared/ui` 조각과 토큰 이름은 S1 이 정한 것이다(아래 "색과 글자").

**모든 화면에 대한 규칙**

- 대화 본문, 리포트, 추모 편지, 사용자의 이메일은 어느 화면에도 두지 않는다. 서버의 관리자 API 도 그것을 주지 않으며, 화면이 다른 API 를 불러 채우지 않는다.
- 브라우저는 같은 출처의 `/v1/...` 만 부른다(`next.config.ts` 의 rewrites 가 `API_BASE_URL` 로 넘긴다).
- 글은 한국어이고 운영자용이다. 존댓말 "~요" 체로 짧게 쓴다. 글자 리터럴은 `views` 와 `widgets` 에만 두고 `shared/ui` 에는 props 로 넘긴다.
- 화면 예시와 테스트 픽스처의 계정, 회사, 수치는 지어낸 값만 쓴다(예: `demo-viewer`, `예시 동물병원`).

## 1. 공통 상태

모든 데이터 화면이 같은 모양을 쓴다.

| 상태 | 보이는 것 | 조각 |
|---|---|---|
| 불러오는 중 | 카드 자리와 그래프 자리에 같은 크기의 회색 블록. 글은 스크린 리더용으로만 "불러오고 있어요" | `Skeleton` |
| 비어 있음 | 카드는 0 과 "—" 를 그대로 보이고, 그래프 자리에 "이 기간에는 기록이 없어요." 와 "기간을 넓혀 보세요." | `EmptyState(title, description)` |
| 오류(5xx, 네트워크) | 화면 위쪽에 "불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." 와 `다시 시도` 버튼. 이전에 받은 값이 있으면 지우지 않고 아래에 둔다 | `Alert(tone=danger)`, `Button(variant=secondary, size=sm)` |
| 400(기간 오류) | 기간 선택 아래 `Field` 의 오류 자리에 서버 문구를 한국어로 바꿔 보인다(아래 "기간 선택") | `Field(error)` |
| 401 | 로그인 화면으로 보낸다. `?next=<지금 경로와 질의>` 를 붙여 로그인 뒤 되돌아온다 | `shared/api` 가 401 을 구분해 던지고, `(dashboard)/layout.tsx` 의 가드가 보낸다 |
| 403 | 권한 없음 화면(`/forbidden`)으로 보낸다 | 같은 가드 |

동작 버튼(승인, 정지 등)은 요청 중에 `disabled` 이고, 끝나면 목록을 다시 받는다. 동작이 실패하면 그 화면 위쪽 `Alert(tone=danger)` 에 서버 문구를 그대로 보인다(서버 문구는 영어인 Nest 모양 `message` 다. 앞에 "처리하지 못했어요: " 를 붙인다).

## 2. 껍데기 (`widgets/app-shell`)

로그인한 화면(`app/(dashboard)/layout.tsx`)이 모두 이 껍데기 안에 있다. 로그인과 권한 없음 화면에는 껍데기가 없다.

**구성**

- 앱 이름: "Beside Pet 운영". 누르면 `/models`.
- 탐색 세 개: `모델`(/models), `대화`(/conversations), `계정`(/accounts). 지금 화면은 `aria-current="page"` 와 아래 2px `--accent` 선.
- 오른쪽: 로그인한 운영자 이름(`entities/viewer` 의 `username`, `text-fg-muted`)과 `로그아웃` 버튼(`features/logout`, `Button variant=ghost size=sm`). 로그아웃은 `POST /v1/auth/logout` 뒤 `/login` 으로 간다.
- 본문은 가운데 정렬, 최대 너비 1200px, 좌우 여백 24px(넓은 화면) / 16px(390px).
- 각 화면의 제목은 껍데기가 아니라 화면이 `PageTitle(title, description, actions)` 로 단다.

**넓은 화면(768px 이상)**: 머리 한 줄, 높이 56px, `bg-surface` 와 아래 `border-border` 선.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Beside Pet 운영    모델  대화  계정                  demo-admin  로그아웃 │
└──────────────────────────────────────────────────────────────────────┘
```

**390px**: 두 줄. 첫 줄은 앱 이름과 로그아웃, 운영자 이름은 첫 줄에서 앱 이름 오른쪽에 말줄임(`truncate`). 둘째 줄은 탐색 세 개를 같은 너비로 나눈 탭(높이 44px, 터치 영역). 가로 스크롤은 없다.

```
┌──────────────────────────────┐
│ Beside Pet 운영  demo-a… 로그아웃 │
├─────────┬─────────┬──────────┤
│  모델    │  대화    │   계정    │
└─────────┴─────────┴──────────┘
```

## 3. 로그인 (`views/login`, 라우트 `/login`)

- 가운데 카드 하나(`Card`, 최대 너비 360px). 제목 "Beside Pet 운영", 설명 "관리자 계정으로 로그인해요."
- `features/login`: `Field(label="아이디")` + `Input`, `Field(label="비밀번호")` + `Input type=password`, `Button(variant=primary)` "로그인"(카드 너비 가득).
- 흐름: `POST /v1/auth/login` → `GET /v1/auth/me` → `role === 'admin'` 이면 `next` 또는 `/models`, 아니면 `/forbidden`.
- 상태:
  - 보내는 중: 버튼 `disabled`, 글 "로그인하는 중…".
  - 빈 칸: 보내지 않고 그 칸 아래 "아이디를 입력해 주세요." / "비밀번호를 입력해 주세요."
  - 401: 카드 위 `Alert(tone=danger)` "아이디나 비밀번호가 맞지 않아요." 비밀번호 칸만 비운다.
  - 그 밖의 오류: "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요."
- 이미 로그인한 관리자가 `/login` 을 열면 `/models` 로 보낸다.

## 4. 권한 없음 (`views/forbidden`, 라우트 `/forbidden`)

- 가운데 `EmptyState`: 제목 "이 계정으로는 운영 화면을 쓸 수 없어요", 설명 "관리자 계정으로 다시 로그인해 주세요." 그 아래 `features/logout` 의 버튼을 `variant=primary` 로 "다른 계정으로 로그인"(로그아웃 뒤 `/login`).
- 로그인한 계정의 아이디를 한 줄 보인다: "지금 계정: demo-viewer". 로그인하지 않은 채 열면 `/login` 으로 보낸다.
- 화면 쪽 막음은 편의다. 판정은 서버(`403 Insufficient role`)가 한다.

## 5. 기간 선택 (`features/select-period`)

모델과 대화 화면이 같이 쓴다. 화면 제목 오른쪽(`PageTitle actions`)에 둔다.

**서버의 기간 질의** (`apps/server/src/metrics/period.rs`, `api.rs`)

- `GET /v1/admin/metrics/models?from=&to=`, `GET /v1/admin/metrics/conversations?from=&to=`. 둘 다 선택이다.
- 읽는 모양: 시간대가 있는 ISO-8601 시각, 시간대 없는 시각(`YYYY-MM-DDTHH:MM:SS[.fff]`, UTC 로 읽는다), 날짜(`YYYY-MM-DD`, 그날 0시 UTC).
- 비우면 `to` 는 지금, `from` 은 `to` 의 7일 전.
- 400 문구: `from must be a valid ISO 8601 date string`(`to` 도 같음), `to must not be before from`, `Range must be at most 90 days`. 모르는 질의 칸도 400 이다(다른 칸을 붙이지 않는다).
- 응답의 `daily` 는 **UTC 날짜**로 묶인다.

**선택지**: `Segmented` 에 `오늘` / `7일` / `30일` / `직접 입력`. 기본은 `7일`.

| 선택 | 보내는 질의 |
|---|---|
| 오늘 | `from` = 이 브라우저의 오늘 0시를 `toISOString()` 한 값, `to` 없음 |
| 7일 | 둘 다 없음(서버 기본) |
| 30일 | `from` = 지금 − 30일의 `toISOString()`, `to` 없음 |
| 직접 입력 | 시작일, 종료일 `Input type=date` 두 칸. `from` = 시작일 0시(로컬)의 `toISOString()`, `to` = 종료일 다음 날 0시(로컬) − 1ms 의 `toISOString()` |

- 직접 입력은 보내기 전에 화면에서 거른다: 종료일이 시작일보다 앞이면 "종료일이 시작일보다 앞이에요.", 90일을 넘으면 "한 번에 90일까지 볼 수 있어요." 서버가 그래도 400 을 주면 위 세 문구를 같은 한국어로 바꿔 보이고, 모르는 문구는 그대로 보인다.
- 고른 기간은 주소의 질의(`?period=today|7d|30d` 또는 `?from=YYYY-MM-DD&to=YYYY-MM-DD`)에 둔다. 새로 고침과 링크 공유에 남고, 껍데기의 `모델` ↔ `대화` 링크는 이 질의를 이어 붙인다.
- 기간 아래에 작게(`text-fg-muted`) 응답의 `from`, `to` 를 로컬 시각으로 보인다: "2026-10-14 09:00 ~ 2026-10-21 15:42". 그래프의 날짜는 UTC 이므로 그래프 제목 옆에 "날짜는 UTC 기준" 을 붙인다.

## 6. 모델 계측 (`views/models`, 라우트 `/models`, 첫 화면)

`(dashboard)/page.tsx`(`/`)는 `/models` 로 보낸다.

**응답** `GET /v1/admin/metrics/models` (`ModelsResponse`, `apps/server/src/metrics/api.rs`, `source.rs`)

```ts
{
  from: string;              // ISO, ms 까지
  to: string;
  models: Array<{            // ModelUsage: (provider, model, purpose, promptVersion) 묶음 하나
    provider: string;
    model: string;
    purpose: 'reply' | 'crisis' | 'report';   // DB CHECK 의 세 값
    promptVersion: string;
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    p50Ms: number;
    p95Ms: number;
    firstTokenP50Ms?: number; // 스트리밍 호출이 없으면 칸이 없다
    costUsd: number;
  }>;
  daily: Array<{             // DailyUsage: (UTC 날짜, provider, model) 묶음 하나
    date: string;            // YYYY-MM-DD
    provider: string;
    model: string;
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}
```

이 타입은 `entities/metrics` 가 갖는다(S5). `daily` 에는 `purpose`, `promptVersion` 이 **없다**. 그래서 역할·버전 거르기는 카드와 표에만 걸리고 그래프에는 걸리지 않는다(아래).

**블록 순서**

1. `PageTitle(title="모델 계측", description="대화 모델의 호출, 토큰, 응답 시간, 비용을 봐요.", actions=<select-period>)`
2. `features/filter-breakdown`: `Select(label="역할")` 선택지 `전체`, `발화 (reply)`, `위기 판정 (crisis)`, `리포트 (report)`. `Select(label="프롬프트 버전")` 선택지 `전체` + 지금 응답의 `models[].promptVersion` 의 서로 다른 값(글자 순 내림차순, 최신이 위). 고른 값은 주소 질의 `?purpose=&version=` 에 둔다. 응답에 없는 버전이 질의에 있으면 `전체` 로 되돌린다.
3. `widgets/model-dashboard` 의 카드 줄(거른 `models` 행으로 계산).
4. 같은 위젯의 그래프 셋(`daily` 로, 거르기와 무관).
5. 같은 위젯의 나눠 보기 표(거른 `models` 행).

**카드** (`Card`, 숫자는 `tabular-nums`, 큰 글자)

| 카드 | 값 | 계산 |
|---|---|---|
| 호출 | `1,284회` | Σ`calls` |
| 실패율 | `0.8%`, 아래 작게 `실패 10회` | Σ`errors` / Σ`calls`. 호출 0 이면 "—". 5% 이상이면 값 글자를 `--danger` |
| 입력 토큰 | `412,300` | Σ`inputTokens` |
| 출력 토큰 | `98,120` | Σ`outputTokens` |
| 응답 시간 p50 | `1.4초` | 아래 "백분위 카드" |
| 응답 시간 p95 | `3.9초` | 아래 "백분위 카드" |
| 첫 글자까지 p50 | `620ms` | `firstTokenP50Ms`. 거른 행에 이 칸이 하나도 없으면 "—", 아래 작게 "스트리밍 호출 없음" |
| 추정 비용 | `$1.27` | Σ`costUsd`. 아래 작게 "단가표 기준 추정" |

- **백분위 카드**: 백분위는 행끼리 더하거나 평균할 수 없다. 거른 행이 하나면 그 값을 보인다. 둘 이상이면 가장 작은 값과 큰 값을 "1.1–2.3초" 로 보이고 아래 작게 "3개 묶음, 아래 표에서 각각" 을 붙인다. 첫 글자까지 p50 도 같다.
- 수 표기(`shared/lib`): 정수는 `toLocaleString('ko-KR')`, ms 는 1000 미만이면 `620ms`, 이상이면 소수 한 자리 `1.4초`, 비율은 소수 한 자리 `%`, 비용은 $1 이상이면 소수 둘, 미만이면 유효 숫자 셋(`$0.00412`).
- 카드 배치: 넓은 화면 4열 2줄, 768px 미만 2열, 480px 미만 1열(아래 "390px").

**그래프 셋** (`daily`, 날짜는 UTC)

그래프 위에 `Select(label="모델")`: `전체 모델` + `daily` 의 서로 다른 `provider / model`. `전체 모델` 은 날짜마다 더한다. 기간 안에서 `daily` 에 없는 날짜는 0 으로 채운다(서버의 `llm_calls_daily` 는 호출이 없는 날의 행을 만들지 않는다). 날짜 범위는 응답의 `from`, `to` 의 UTC 날짜다.

| 그래프 | 종류 | x 축 | y 축 | 계열 |
|---|---|---|---|---|
| 날짜별 호출과 실패 | 막대(겹치지 않고 나란히) | 날짜 `MM/DD` | 횟수 | 호출 `--chart-1`, 실패 `--danger` |
| 날짜별 토큰 | 쌓은 막대 | 날짜 | 토큰(만 단위 줄임: `12만`) | 입력 `--chart-2`, 출력 `--chart-3` |
| 날짜별 추정 비용 | 선(점 표시) | 날짜 | USD | 비용 `--chart-4` |

- 높이 240px(넓은 화면), 200px(390px). 너비는 부모 가득(`ResponsiveContainer`).
- 넓은 화면은 첫 그래프가 한 줄을 다 쓰고, 나머지 둘이 아래 2열. 768px 미만은 모두 1열.
- 툴팁: 전체 날짜 `2026-10-14 (UTC)` 와 계열 값. 범례는 그래프 위 왼쪽.
- 애니메이션은 끈다(`isAnimationActive={false}`). 차분한 화면이고 테스트가 쉬워진다.
- 날이 하루뿐(오늘)이어도 막대 하나로 그린다. 모든 값이 0 이면 그래프 대신 공통 "비어 있음".
- 접근성: 그래프마다 `figure` 와 `figcaption`(제목, "날짜는 UTC 기준"), 그리고 같은 수치를 담은 `sr-only` 표. 위젯 테스트는 SVG 대신 이 표와 카드의 숫자를 본다.
- 거르기와 무관하다는 것을 그래프 묶음 제목 옆에 적는다: "날짜별 추이 · 역할과 버전 거르기는 적용되지 않아요".

**나눠 보기 표** (거른 `models` 행. 정렬은 `calls` 내림차순)

열: `모델`(`provider / model`), `역할`(배지: 발화 `neutral`, 위기 판정 `warning`, 리포트 `neutral`), `프롬프트 버전`, `호출`, `실패율`, `입력 토큰`, `출력 토큰`, `p50`, `p95`, `첫 글자 p50`, `비용`. 숫자 열은 오른쪽 정렬.

390px 에서는 표 대신 행마다 카드(아래 "390px").

**상태**

- 불러오는 중: 카드 8개, 그래프 3개, 표 자리의 `Skeleton`.
- `models` 가 비었으면: 카드는 0 과 "—", 그래프와 표 자리는 `EmptyState(title="이 기간에는 모델 호출이 없어요.", description="기간을 넓혀 보세요.")`.
- 거른 결과만 비었으면: 표 자리에 "고른 역할과 버전에 맞는 호출이 없어요." 와 `Button(variant=ghost)` "거르기 지우기".

## 7. 대화 (`views/conversations`, 라우트 `/conversations`)

**응답** `GET /v1/admin/metrics/conversations` (`ConversationsResponse`)

```ts
{
  from: string;
  to: string;
  daily: Array<{             // ConversationDay (UTC 날짜)
    date: string;            // YYYY-MM-DD
    sessions: number;        // 그날 만들어진 대화 수
    turns: number;           // 그날의 턴 수
    crisis: { keyword: number; model: number };  // 위기 턴 수를 잡은 쪽으로 나눔
  }>;
}
```

칸 이름은 camelCase 바꿈 없이 그대로다(`ConversationDay` 에 `rename_all` 이 없지만 칸이 모두 한 낱말이라 같다). 활동이 없는 날은 행이 없으므로 0 으로 채운다.

**블록 순서**

1. `PageTitle(title="대화", description="날짜별 대화 수, 턴 수, 위기 감지 수를 봐요. 대화 내용은 볼 수 없어요.", actions=<select-period>)`
2. `widgets/conversation-dashboard` 의 카드 줄:

| 카드 | 값 |
|---|---|
| 새 대화 | Σ`sessions` |
| 턴 | Σ`turns`, 아래 작게 "대화당 평균 3.2턴"(Σturns / Σsessions, sessions 0 이면 줄을 뺀다) |
| 위기 감지 | Σ(`keyword`+`model`), 아래 작게 "키워드 4 · 모델 판정 2". 1 이상이면 카드 왼쪽에 `--warning` 선 |

3. 그래프 둘:

| 그래프 | 종류 | x | y | 계열 |
|---|---|---|---|---|
| 날짜별 대화와 턴 | 막대(대화) + 선(턴), y 축 둘(왼쪽 대화, 오른쪽 턴) | 날짜 `MM/DD` | 수 | 대화 `--chart-1`, 턴 `--chart-2` |
| 날짜별 위기 감지 | 쌓은 막대 | 날짜 | 턴 수(정수 눈금) | 키워드 `--chart-5`, 모델 판정 `--warning` |

  390px 에서는 첫 그래프의 오른쪽 y 축을 숨기고 툴팁으로만 턴 값을 보인다.

4. 상태: 공통. 모두 0 이면 `EmptyState(title="이 기간에는 대화가 없어요.")`.

위기 감지는 수만 보인다. 어떤 턴이 걸렸는지, 그 글은 보이지 않는다.

## 8. 계정 (`views/accounts`, 라우트 `/accounts`)

**서버** (`apps/server/src/identity/api.rs`, `api/response.rs`, `api/request.rs`)

| 동작 | 요청 | 응답 |
|---|---|---|
| 목록 | `GET /v1/admin/accounts` | `AdminAccountResponse[]` |
| 발급 | `POST /v1/admin/accounts` 본문 `{ username(3자 이상), password(8자 이상), company(비지 않음), role?: 'admin'\|'viewer', expiresAt?: ISO }` | 201, `AccountResponse` |
| 승인 | `POST /v1/admin/accounts/{id}/approve` | `AccountResponse` |
| 정지 | `POST .../{id}/revoke` | 같음 |
| 소프트 삭제 | `POST .../{id}/soft-delete` | 같음 |
| 재개(복구) | `POST .../{id}/reactivate` | 같음 |
| 만료 설정 | `PATCH .../{id}/expiry` 본문 `{ expiresAt?: ISO }`(없거나 `null` 이면 해제) | 같음 |
| 완전 삭제 | `DELETE /v1/admin/accounts/{id}` | 204 |

`AccountResponse` 칸: `id`, `username`, `company`, `role`('admin'\|'viewer'), `status`('pending'\|'active'\|'revoked'\|'deleted'), `expiresAt?`, `expired`(boolean, 서버가 지금 시각으로 계산), `createdAt`, `lastLoginAt?`, `chatLanguage?`('ko'\|'en'). `AdminAccountResponse` 는 여기에 `sessionCount`(지금 남은 대화 수)와 `lastActiveAt?`(그 대화들의 마지막 메시지 시각)을 더한다. 이메일 칸은 없다.

**보이는 상태** (`entities/account` 가 계산. 대화 웹과 같다)

`status === 'active' && expired` 이면 `만료됨`, 아니면 status 그대로. 배지: 승인 대기 `warning`, 활성 `success`, 만료됨 `neutral`, 정지됨 `danger`, 삭제됨 `neutral`(행 글자 `text-fg-muted`).

**블록 순서**

1. `PageTitle(title="계정", description="계정을 발급하고 승인, 정지, 만료를 정해요. 대화 내용은 볼 수 없어요.", actions=<Button variant=primary "계정 발급">)`
2. 집계 줄: 승인 대기, 활성, 만료됨, 정지됨 네 칸(`Card`, 작은 숫자). 누르면 그 상태로 거른다. 삭제됨은 세지 않는다.
3. 거르기 줄: `Input type=search` "아이디나 소속으로 찾기" + `Segmented` `전체 / 승인 대기 / 활성 / 만료됨 / 정지됨 / 삭제됨`. 390px 에서는 `Segmented` 대신 `Select(label="상태")`(여섯 개는 390px 에 들어가지 않는다).
4. `widgets/account-table`: 정렬은 승인 대기가 위, 그다음 `createdAt` 내림차순.

**표 열** (768px 이상)

| 열 | 칸 | 표기 |
|---|---|---|
| 아이디 | `username`, 관리자면 옆에 `Badge(neutral)` "관리자" | |
| 소속 | `company` | |
| 상태 | 보이는 상태 배지 | |
| 대화 수 | `sessionCount` | 오른쪽 정렬 |
| 마지막 활동 | `lastActiveAt` | 상대 시각 "3일 전", `title` 에 절대 시각. 없으면 "—" |
| 마지막 로그인 | `lastLoginAt` | 같음 |
| 만료 | `expiresAt` | `2026-12-31 23:59`(로컬). 없으면 "기한 없음". 만료됨이면 `--danger` 글자 |
| 동작 | `features/moderate-account` | 아래 |

`chatLanguage`, `createdAt`, `id` 는 열로 두지 않는다(`createdAt` 은 정렬에만).

**행 동작** (`features/moderate-account`, 버튼은 `size=sm`)

| 보이는 상태 | 버튼 |
|---|---|
| 승인 대기 | `승인`(primary), `삭제`(ghost, 소프트 삭제) |
| 활성 | `만료 설정`(secondary), `정지`(secondary), `삭제`(ghost) |
| 만료됨 | `만료 연장`(secondary), `정지`(secondary), `삭제`(ghost) |
| 정지됨 | `재개`(secondary), `삭제`(ghost) |
| 삭제됨 | `복구`(secondary, reactivate), `완전 삭제`(danger) |

- 관리자 행(`role === 'admin'`)에는 동작을 두지 않고 "—" 를 보인다. 스스로 잠그는 사고를 막는다(대화 웹과 같다).
- 확인을 묻는 것(`Modal`): 정지, 삭제, 완전 삭제. 승인, 재개, 복구, 만료는 바로 한다.
  - 정지: 제목 "demo-viewer 계정을 정지할까요?", 본문 "정지하면 이 계정의 다음 요청부터 대화 웹이 로그인 화면으로 돌아가요. 언제든 재개할 수 있어요.", 버튼 `취소` / `정지`(danger).
  - 삭제: "demo-viewer 계정을 삭제할까요?", "삭제한 계정은 로그인할 수 없어요. 나중에 복구할 수 있어요.", `취소` / `삭제`(danger).
  - 완전 삭제: "demo-viewer 계정을 완전히 지울까요?", "계정이 지워지고 되돌릴 수 없어요. 같은 아이디로 다시 발급할 수 있어요.", 그리고 아이디를 그대로 입력하는 `Input`(맞아야 버튼이 켜진다), `취소` / `완전 삭제`(danger).
- 만료 설정·연장: `Modal` 하나. `Input type=datetime-local`(로컬 시각, 보낼 때 `toISOString()`), 빠른 선택 버튼 `+30일`, `+90일`, `+1년`(지금 또는 지금 만료일 중 늦은 쪽에서), 만료가 있으면 `만료 해제`(ghost, `expiresAt` 없이 보냄). 버튼 `취소` / `저장`.

**발급 폼** (`features/issue-account`)

`계정 발급` 버튼이 `Modal` 을 연다. 칸: `아이디`(3자 이상), `비밀번호`(8자 이상, `type=password`), `소속`, `역할`(`Select`: `일반 (viewer)` 기본, `관리자 (admin)`), `만료`(선택, `datetime-local`). 칸 아래 오류는 화면에서 먼저 거르고("아이디는 3자 이상이에요." 등), 서버 400/409 문구는 모달 위 `Alert` 에. 성공하면 모달을 닫고 목록을 다시 받고, 표 위에 `Alert(tone=info)` "demo-viewer 계정을 만들었어요." 를 몇 초 보인다. 비밀번호는 다시 보이지 않는다.

**상태**

- 불러오는 중: 집계 4칸과 표 행 5개의 `Skeleton`.
- 계정이 없으면: `EmptyState(title="아직 계정이 없어요.", description="오른쪽 위 계정 발급으로 만들어요.")`.
- 거른 결과가 없으면: "찾는 계정이 없어요."

## 9. 390px 배치

PRD "사람이 할 일" 4번(390×760)에서 세 화면 모두 가로 넘침이 없어야 한다. 정한 것:

- **표는 카드형으로 바꾼다.** 가로 스크롤 표는 두지 않는다. 768px 미만에서 `account-table` 과 모델 나눠 보기 표는 행마다 `Card` 하나를 그린다.
  - 계정 카드: 첫 줄 아이디(+관리자 배지)와 상태 배지(오른쪽), 둘째 줄 소속(`text-fg-muted`), 그 아래 `dl` 두 열로 대화 수 · 마지막 활동 · 마지막 로그인 · 만료, 맨 아래 동작 버튼(`flex-wrap`).
  - 모델 카드: 첫 줄 `provider / model` 과 역할 배지, 둘째 줄 프롬프트 버전, 아래 `dl` 두 열로 호출 · 실패율 · 토큰(입력/출력) · p50 · p95 · 첫 글자 · 비용.
- 카드 줄: 480px 미만 1열. (모델 카드 8개는 1열이면 길어지므로 390px 에서는 "호출, 실패율, p50, p95" 네 개를 먼저 보이고 나머지 넷은 `더 보기` 로 펼친다.)
- 그래프: 1열, 높이 200px, x 축 눈금은 겹치지 않게 간격을 둔다(`interval="preserveStartEnd"`, `minTickGap` 16).
- 기간 선택: `Segmented` 네 칸이 한 줄에 들어간다(각 약 80px). 직접 입력의 날짜 두 칸은 세로로 쌓는다. `PageTitle` 의 actions 는 제목 아래 줄로 내려간다.
- 거르기(`filter-breakdown`): `Select` 두 개를 세로로 쌓는다.
- 모달: 화면 가득(좌우 16px 여백), 버튼은 아래에 가득 너비.
- 긴 아이디·소속·모델 이름은 `break-all` 이 아니라 `truncate` + `title`.
- 확인 방법: 테스트에서 `document.documentElement.scrollWidth <= 390` 은 jsdom 이 배치를 하지 않아 볼 수 없다. S7/S8 은 브라우저(390×760)로 직접 띄워 본다.

## 10. 색과 글자

S1 이 `app/globals.css` 에 둔 토큰을 쓴다. 라이트 하나뿐이고 다크는 없다. **색 값은 토큰으로만 쓴다**(대화 웹과 같은 규칙). 컴포넌트에 `#hex`, `rgb()` 를 쓰지 않고 Tailwind 클래스(`bg-surface`, `text-fg-muted`, `border-border` 처럼 `--` 를 뺀 이름)나 `var(--...)` 로 쓴다.

| 토큰 | 쓰는 곳 |
|---|---|
| `--bg`, `--bg-sunk` | 페이지 바탕, 표 머리·집계 칸 바탕 |
| `--surface` | 카드, 머리, 모달 |
| `--fg`, `--fg-muted` | 본문, 보조 글(단위, 설명, 비활성 행) |
| `--border`, `--border-strong` | 카드·표 선, 입력 칸 선 |
| `--accent`, `--accent-fg`, `--accent-soft` | 주 버튼, 지금 탭 선, 선택된 `Segmented` |
| `--danger`, `--danger-fg`, `--danger-soft` | 위험 버튼, 실패 계열, 높은 실패율, 정지됨 배지 |
| `--success`, `--success-soft` | 활성 배지 |
| `--warning`, `--warning-soft` | 승인 대기 배지, 위기 감지 카드 선, 모델 판정 계열 |
| `--chart-1` … `--chart-5` | 그래프 계열(위 표대로) |

- 그래프 색은 Recharts 에 `stroke="var(--chart-1)"`, `fill="var(--chart-1)"` 로 넘긴다. S7 은 브라우저에서 색이 실제로 칠해지는지 본다. 칠해지지 않으면 위젯의 `lib` 에 `getComputedStyle(document.documentElement)` 로 토큰 값을 한 번 읽는 훅을 두고 그 값을 넘긴다. 어느 쪽이든 색 값을 코드에 적지 않는다.
- 글꼴은 Pretendard 하나(`font-sans`). 숫자는 모두 `tabular-nums`. 크기: 화면 제목 24px/600, 카드 숫자 28px/600(390px 24px), 본문 14px, 보조 12–13px.
- 간격: 4px 배수. 카드 안 16px(390px 14px), 블록 사이 24px.

## 11. 그래프 라이브러리

**고른 것: Recharts 3.10.1, 라이선스 MIT.** 피어 의존성 `react-is` 를 같이 들인다(React 와 같은 `19.2.4`).

**비교** (라이선스, 버전, 피어 의존성은 2026-10-21 `npm view <pkg> license version peerDependencies` 로 확인. 번들 크기는 같은 날 이 머신에서 esbuild 0.25.0 `--bundle --minify` 로 선 그래프와 막대 그래프를 하나씩 그리는 최소 진입점을 묶고 `gzip -9` 로 잰 값이다. React 19.2.4 + react-dom 만 묶은 바탕이 194,271 B, gzip 60,396 B)

| 후보 | 버전 | 라이선스 | React 19 피어 | 그리는 방식 | 번들(바탕 포함, gzip) | 판정 |
|---|---|---|---|---|---|---|
| recharts | 3.10.1 (2026-07-25) | MIT | `^19.0.0` (react, react-dom, react-is) | SVG, 선언형 컴포넌트 | 185,590 B (바탕 대비 +125 KB) | **고름** |
| chart.js + react-chartjs-2 | 4.5.1 + 5.3.1 | MIT, MIT | react-chartjs-2 가 `^19.0.0` | Canvas | 121,619 B (+61 KB) | 버림 |
| @nivo/line (나머지 @nivo/*) | 0.99.0 | MIT | `^19.0` | SVG, `@react-spring/web` 필요 | 재지 않음 | 버림 |
| @visx/xychart | 4.0.0 | MIT | `^19.0.0`, `@react-spring/web` 피어 | SVG, 저수준 조각 | 재지 않음 | 버림 |
| uplot | 1.6.32 | MIT | 피어 없음(React 래퍼 없음) | Canvas, 명령형 | 재지 않음 | 버림 |
| 직접 SVG | - | - | - | SVG | 0 | 버림 |

**고른 이유**

- 그래프가 SVG 라 계열 색에 CSS 토큰을 넘길 수 있고, Canvas 처럼 그릴 때 색 값을 따로 읽어 넣지 않아도 된다(위 "색과 글자"의 확인을 S7 이 한다).
- 위젯 테스트가 jsdom 에서 돈다. Canvas 를 쓰는 chart.js 와 uPlot 은 jsdom 에 canvas 가 없어 가짜를 세워야 한다. Recharts 는 DOM 요소를 그린다(크기를 재는 `ResponsiveContainer` 는 jsdom 에서 너비가 0 이라, 테스트는 위 `sr-only` 표와 카드 숫자를 본다).
- 필요한 그래프(막대, 쌓은 막대, 선, 막대+선의 두 y 축, 툴팁, 범례)가 모두 기본 컴포넌트로 있어 직접 SVG 나 visx 보다 코드가 적다.
- 번들은 chart.js 보다 gzip 64 KB 쯤 크다. backoffice 는 이 머신에서 운영자 한 명이 쓰는 앱이고 그래프는 `/models`, `/conversations` 에서만 불리므로 받아들인다. 그 두 화면의 위젯만 Recharts 를 가져오게 해서 로그인·계정 화면의 번들에 들어가지 않게 한다.

**Next 16 과 SSR**

- Recharts 는 브라우저에서 크기를 재고 훅을 쓰므로 그래프를 그리는 파일 맨 위에 `'use client'` 를 둔다(`widgets/model-dashboard/ui/*Chart.tsx`, `widgets/conversation-dashboard/ui/*Chart.tsx`). 데이터는 client component 가 `/v1/...` 에서 받으므로 서버 렌더에서 그래프를 그릴 일은 없다.
- 서버 렌더 때는 그래프 자리에 같은 높이의 `Skeleton` 이 나가고, 첫 데이터가 오면 그래프로 바뀐다. 그래서 배치가 흔들리지 않는다.
- 설치는 S7 이 `pnpm -F @beside-pet/backoffice add recharts@3.10.1 react-is@19.2.4` 로 한다. 버전은 정확히 고정한다.

## 12. 슬라이스 놓임 요약

| 화면 | views | widgets | features | entities |
|---|---|---|---|---|
| 로그인 | `login` | - | `login` | `viewer` |
| 권한 없음 | `forbidden` | - | `logout` | `viewer` |
| 껍데기 | (layout) | `app-shell` | `logout` | `viewer` |
| 모델 계측 | `models` | `model-dashboard` | `select-period`, `filter-breakdown` | `metrics` |
| 대화 | `conversations` | `conversation-dashboard` | `select-period` | `metrics` |
| 계정 | `accounts` | `account-table` | `issue-account`, `moderate-account` | `account` |

같은 레이어끼리 가져오지 않으므로 `model-dashboard` 는 `select-period` 를 품지 않는다. 기간과 거르기의 값은 `views/models` 가 주소 질의에서 읽어 위젯과 기능에 props 로 넘긴다.
