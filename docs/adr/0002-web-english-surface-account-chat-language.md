---
id: ADR-0002
date: 2026-10-16
status: accepted
tags: [market, locale, language, safety]
related: [ADR-0001, ADR-0004, ADR-0009]
---
# 웹은 고정 문구를 영어 한 벌로 두고, 대화 언어는 계정마다 한국어와 영어 중에서 고른다

## 맥락

모바일 시기에는 미국 시장, 영어 전용이 전제였다(ADR-0001). 웹 제품(지금의 `apps/web`, `apps/api`)은 그 전제를 따로 다시 정하지 않은 채 만들어졌고, 코드가 사실상 다른 기준을 세웠다. 운영도 서울 리전(ap-northeast-2)의 EC2, RDS, CloudFront 에 올라갔다가 2026-10-16 에 모두 내렸다. 이 글은 코드가 지금 정하고 있는 것을 결정으로 적어, 다음에 시장을 다시 정할 때 출발점이 되게 한다.

## 결정

- 서버의 고정 데이터(위기 안내 문구, 자원 목록, 오류 문구)는 영어 한 벌이다. 번역본을 서버에 두지 않는다.
- 대화 언어는 계정 단위로 저장한다(`accounts.chat_language`, 값은 `ko` 또는 `en`). 모델은 세션의 대화 언어로 발화를 만든다. 서버의 `Locale` 목록은 웹의 i18n 설정과 1:1 로 맞춘다.
- 위기 자원은 한국 기준이다. 자살예방상담전화 109, 다누리콜센터 1577-1366(다국어). 위기 안내 문구도 이 두 번호를 가리킨다.
- 위기 키워드 스크린은 영어만 본다. 다른 언어의 위기 신호는 언어를 가리지 않는 모델 판정이 맡는다(ADR-0004).

## 버린 것

| 안 | 이유 |
|---|---|
| 미국 시장, 영어 전용 유지 | 웹 제품에서 실제로 쓰는 사람과 운영 리전이 한국이었다. 다만 이것은 코드가 먼저 간 것이고, 시장 결정 문서는 없다 |
| 서버에 언어별 고정 문구 | 번역 관리가 서버와 웹 두 곳으로 나뉜다. 사람에게 보이는 고정 문구는 웹이 번역하고, 생성 발화는 모델이 대화 언어로 쓴다 |

## 결과

- 대상 시장은 아직 열린 질문이다. 한국 위기 번호와 영어 고정 문구가 같이 있는 상태라, 한국어로 대화하는 사용자는 영어 위기 안내를 받는다. 시장을 정할 때 위기 자원 목록, 키워드 스크린의 언어, 약관의 준거법(ADR-0012)을 함께 바꿔야 한다.
- 모바일 시기의 미국 기준 문서(사업계획, 약관, 개인정보 가이드)는 그대로 가져다 쓰지 않는다.
- Rust 포팅은 이 동작(대화 언어 칸, 고정 문구, 자원 목록)을 그대로 옮긴다.

## 근거

- `apps/api/src/shared/locale.ts`: `LOCALES = ['ko', 'en']`, "Static server data is English-only".
- `apps/api/src/safety/domain/safety-resources.ts`: 109 와 1577-1366, 고정 위기 문구.
- `apps/api/src/safety/domain/crisis-pattern.ts`: "English keywords only".
- `apps/api/src/infrastructure/database/migrations/1730000000000-initial-schema.ts`: `chat_language` 칸.
- `docs/research/2026-10-16-deploy-analysis.md`: 운영 리전 ap-northeast-2, 같은 날 자원 삭제.
- `apps/api/README.md` 의 로드맵 "계정 단위 대화 언어, 정적 표면은 영어 단일본, 응답은 모델이 대화 언어로 생성".
