# 백엔드 ARCHITECTURE — Beside Pet

> NestJS + DDD 지지 에이전트의 내부 설계. "왜 이렇게 했나"를 설명하기 위한 문서.
> 제품 맥락은 [01-product-overview.md](01-product-overview.md), 전체 그림은 [02-architecture.md](02-architecture.md).

---

## 1. 설계 원칙 (한 줄)

> **흐름은 코드가, 발화는 모델이.** 단계는 *상태*에, 에이전트는 *역할*에.

동반 대화는 흐름을 LLM의 자율 판단에 맡기면 같은 질문을 반복하거나 맴돌기 쉽다. 그래서 "다음에 무엇을 할지"는 **명시적 오케스트레이터**(`src/support/application/support.orchestrator.ts`)가 직접 결정한다. 프레임워크의 그래프 대신 평범한 코드로 흐름을 쥐면, 전이 규칙이 곧 읽히는 도메인 로직이 되고 디버깅·테스트·교체가 전부 단순해진다.

한 턴의 흐름:

```
안전 확인 → 단계 전이 판단 → 지식 검색 → 공감 발화 생성 → 턴 분석 → 영속화
```

## 2. 에이전트 구성 (역할 3 + 도구 1)

> 원칙: **상담 단계마다 에이전트를 만들지 않는다.** 단계 전이는 오케스트레이터가 맡는다.

| 역할 | 실행 시점 | 책임 | 파일 |
|------|-----------|------|------|
| Planner | 세션 시작 1회 | 애도 프로필 → 지지 계획(경로별 초점·주의점) | `src/support/application/agent/planner.agent.ts` |
| Supervisor | 게이트 통과 시만 | 생성된 발화의 백그라운드 품질 점검 (비용 통제: 전이·안전 상승·샘플링 시에만) | `src/support/application/agent/supervisor.agent.ts` |
| Summarizer | 세션 종료 1회 | 구조적 세션 요약 → 세션 간 기억 | `src/support/application/agent/summarizer.agent.ts` |
| RAG (도구) | 매 턴 | 애도 지식 검색 (포트 뒤 — pgvector 교체 가능) | `src/support/infrastructure/knowledge/rag.adapter.ts` |

발화 자체는 에이전트가 아니라 **reply composer**(`src/support/infrastructure/llm/reply-composer.adapter.ts`)가 만든다 — 프롬프트는 `prompt/` 모듈에 분리되어 있고, 단계 정보는 phase 파라미터로 주입된다. 단계를 에이전트로 만들면 역할이 겹치고 비대해진다 — 단계는 상태에, 에이전트는 역할에 둔다.

## 3. 맴돌이 방지 — 결정론적 깊이 게이트 (이 프로젝트의 핵심)

전이 규칙은 순수 도메인 서비스(`src/support/domain/service/task-progression.service.ts`)가 전사에서 파생해 결정한다 — 별도 카운터를 영속화하지 않는다.

```
단계당 최소 MIN_DEPTH(3)턴 머문 뒤 진솔한 답    → 다음 단계로 전이
비몰입("모르겠어요" 류) DISENGAGE_EXIT(2)연속   → 부드러운 조기 전이 (강요하지 않는다)
어떤 경우에도 MAX_DEPTH(5)턴                    → 하드캡 전이 (반드시 탈출)
위기 신호                                       → 즉시 핸드오프·종료
```

세 장치가 맞물려 루프를 *구조적으로* 제거한다: 비몰입을 미완료로 보고 같은 질문을 되묻는 맴돌이를 차단하고(조기 전이), 몰입하면 한 겹씩 깊어지는 후속 질문(deepen phase)을 주며, 상한이 있어 어떤 경로로도 반드시 빠져나간다. 생성 모델이 자유롭게 되묻지 못하도록 **코드가 흐름을 통제**한다.

## 4. 단일 상태 — Session 애그리게이트 (`src/support/domain/model/session.ts`)

턴의 구조적 결정은 전부 이 애그리게이트에서 나오고, 상태 전이는 메서드로만 일어난다.

| 필드 | 역할 |
|------|------|
| `task` (0~5) | Worden 4과제 진행 위치 · `progress` = (task−1)/4 |
| `retryCount` | 재질문 각도 조절 |
| `supportLevel` (1~3) | 안전 등급 — 단조 상승, 3이면 핸드오프 |
| `closed` | 종료 뒤 턴 거부는 도메인 불변식(`assertOpen`) |
| `griefProfile` | 온보딩 수집 프로필 (+ 대화 언어) |
| `history` | 전사 — 깊이 게이트·연속성·리포트의 원천 |
| `plan` / `analyses[]` / `summary` | Planner 계획 · 턴별 분석 · 종료 요약 |

## 5. 안전 (Safety)

모든 턴은 발화 생성 **전에** 이중 스크린을 거친다 — **키워드 fast-path ∪ 모델 판정**(언어 무관), 어느 쪽이든 걸리면 위기로 처리한다(안전은 오탐 쪽으로 보수적). 위기면 고정 안내 문구(모델 생성 아님)로 전문 자원·헬프라인에 연계하고 세션을 닫는다. 판정 모델 호출이 실패해도 키워드 스크린이 폴백으로 남는다.

## 6. 세션 연속성

- **이어하기**: 열린 세션에 재입장 — 전사와 진행 상태가 그대로 복원된다.
- **새 대화**: 온보딩을 다시 거치지 않는다. 직전 세션의 프로필을 상속하고 도달했던 단계에서 재개하며, **직전 세션의 요약·전사 꼬리**를 재개 인사 프롬프트에 주입해 동반자가 지난 이야기를 이어받아 말한다 (`PreviousSessionContext`).
- **마음 리포트**: 종료된 세션의 따뜻한 회고(4섹션) — 모델이 전사를 읽고 작성한다. 종료 + 최소 1단계 완료(`REPORT_MIN_TASK`)를 갖춰야 열린다. 내부 분석(`SessionSummary`·`TurnAnalysis`)과는 별개의 사용자용 표면이다.

## 7. llm 모듈 — 모델 호출의 단일 관문 (`src/llm/`)

모든 모델 호출은 `TextModelPort` → `ModelRouter`를 지난다. 요청마다 `ModelRef`(프로바이더·모델)가 실려 다니므로 역할별 모델 교체가 호출부 수정 없이 가능하고, `UsageSink`가 호출별 토큰·USD를 기록한다. 관측(Langfuse)을 붙일 때도 이 관문에 데코레이터 하나를 얹으면 된다. 라이브 전용 — 키 없이는 부팅하지 않는다.

## 8. 영속화 (스키마 C)

- **TypeORM + Postgres 필수** (`DATABASE_URL` 없으면 부팅 실패). 마이그레이션 자동 적용.
- `sessions` = 스칼라 진행 상태 + JSONB 문서(profile·history·plan·summary), `turn_analyses` = 턴별 분석을 **집계 컬럼으로 승격**(+ 인덱스) — 상담 데이터의 2차 가공(위기율·도달률 인사이트)이 SQL 집계로 바로 가능해야 한다는 판단이 스키마에 반영된 것.
- 저장소는 포트(`SessionRepository`·`AccountRepository`) 뒤라 도메인은 어댑터를 모른다.

## 9. identity — 인증·계정

- JWT **httpOnly 쿠키** 로그인, 가드가 매 요청 계정 상태를 재확인(정지·만료 즉시 반영).
- 최초 관리자는 **부팅 로그의 1회용 setup 토큰**으로 생성 — 자격증명이 파일에 남지 않는다.
- 가입은 **승인제**: 공개 신청(`register`) → `pending` → admin 승인 후 로그인 가능.

## 10. REST 표면

프론트가 호출하는 유일한 창구이며, 전체 스키마는 서버가 상시 노출하는 **OpenAPI 문서(`/docs`)** 가 단일 진실이다. 요약은 [02-architecture.md §2](02-architecture.md) 참조. Claude API 키는 서버에만 존재한다.

---

### 설계 한 줄

> "흐름은 명시적 오케스트레이터가 통제하고 모델은 단계 안에서 발화만 한다. 비몰입을 부드러운 전이로 처리하고 깊이 상한을 두어, 대화가 같은 질문을 맴도는 일을 구조적으로 차단했다."
