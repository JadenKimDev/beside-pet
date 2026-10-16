---
id: DEV-2026-03-14-language-switch-was-test-script
date: 2026-03-14
tags: [testing, language, e2e, legacy-mobile]
related: [ADR-0002, DEV-2026-03-13-single-run-hides-stochastic-bugs]
---
# 한국어 대화가 중간에 영어로 바뀐 원인은 프롬프트가 아니라 테스트 스크립트의 enum 값이었다

## 맥락

모바일 시기 v5 프롬프트의 한국어 20턴 테스트에서 4, 5, 15, 16번째 턴의 응답이 영어로 나왔다(3.6점). 모델이 언어 지시를 놓친다고 보기 쉬운 증상이었다.

## 해 본 것

1. 프롬프트의 언어 지시를 보기 전에 테스트가 만든 사용자 프로필이 DB 에 실제로 어떻게 저장됐는지 확인했다.
2. 테스트 스크립트가 프로필 PATCH 에 `ageRange: '30-39'` 를 보냈는데, DB 의 enum 에 그 값이 없었다. 검증 실패로 PATCH 전체가 거부됐고, 같은 요청에 실린 `preferredLanguage: ko` 도 저장되지 않았다. 서버는 기본 언어(영어)로 응답하고 있었다.
3. 스크립트의 값을 enum 에 맞추고 다시 돌렸다.

## 결과

- 19턴 모두 한국어를 유지했고 em-dash 도 0회였다.
- 교훈: 품질 문제처럼 보이는 증상도 먼저 데이터 경로를 본다. 테스트 준비 단계(프로필 저장)의 실패를 조용히 넘기지 말고, 준비 요청이 실패하면 테스트를 바로 멈춘다.
- 여러 칸을 한 요청으로 저장하면 칸 하나의 검증 실패가 나머지를 함께 날린다. 대화 언어처럼 응답 전체를 바꾸는 값은 저장됐는지 응답으로 확인한다. 웹 API 는 대화 언어를 별도 엔드포인트(`me/chat-language`)로 저장한다(ADR-0002).

## 근거

- `docs/research/legacy/test-results/2026-03-14/10.dynamic-e2e-v5-report.md`, `docs/research/legacy/test-results/2026-03-14/11.dynamic-e2e-ko-20turn.md`.
