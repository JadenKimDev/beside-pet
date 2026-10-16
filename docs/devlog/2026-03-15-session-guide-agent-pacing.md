---
id: DEV-2026-03-15-session-guide-agent-pacing
date: 2026-03-15
tags: [conversation, pacing, agents, continuity, legacy-mobile]
related: [ADR-0005, ADR-0011, DEV-2026-03-14-prompt-driven-session-structure]
---
# 세션 길이를 프롬프트 규칙으로 맞추려 하자 양쪽으로 다 빗나갔고, 에이전트를 나누자 이음새에서 기능이 끊겼다

## 맥락

모바일 시기 목표는 한 세션 18에서 22턴이었다. 실제로는 13턴 안팎에서 끝났다. 같은 날 SupervisorAgent 를 SessionGuideAgent(Gemini Flash, 사전 가이드)와 AnalystAgent(Gemini Pro, 사후 분석)로 나눴다(ADR-0011).

## 해 본 것

1. v1, v2: 종료 신호(감사 표현) 감지가 늦어 약 13턴에서 끝났다. 한국어 감사 키워드를 더했다.
2. v3: 종료 규칙을 강화했더니 8턴에 끝났다. 7번째 턴의 "고마워요" 한 번에 바로 마무리했고, AI 가 먼저 작별 인사를 해 시뮬레이터가 따라 인사하고 떠나게 만들었다. 깊은 탐색 단계가 아예 일어나지 않았다.
3. v4: "15턴 전에는 어떤 경우에도 session_close 를 하지 말라"를 프롬프트에 박았다.
4. v4 의 다음 테스트에서 사용자가 종료 신호를 두 번 보내도 새 질문을 던졌다(4.25점). "종료 신호가 두 번 이어지면 턴 수와 상관없이 끝낸다"는 예외를 다시 더했다.
5. 에이전트를 나눈 뒤 통합 테스트(평균 5.4초, 56단어)와 버그 리포트를 정리했다.

## 결과

- 턴 수의 하한을 프롬프트에 박으면 사용자의 의사를 무시하고, 종료 신호를 민감하게 하면 너무 일찍 끝난다. 규칙 하나를 고칠 때마다 반대쪽 예외가 붙었다.
- 이음새 버그 둘: 세션 노트에 적은 "다음에 이야기할 주제"가 다음 세션의 할 일 목록으로 전달되지 않았다(BUG-001, 중단 때까지 미해결). 진행 평가 함수(`evaluateSessionProgress`)는 구현만 되고 연결되지 않아 1에서 5번째 턴에 제안 버튼이 비었다. 에이전트가 늘수록 "만들었지만 이어지지 않은" 기능이 생겼다.
- 웹 API 는 둘 다 코드로 옮겼다. 단계마다 최소 3턴, 최대 5턴, 비몰입 두 번이면 넘어감(ADR-0005). 세션 종료는 사용자가 정하고(`/close`), 다음 세션은 직전 세션의 요약과 전사 꼬리를 재개 인사에 넣는다(`PreviousSessionContext`). BUG-001 의 자리를 구조로 메운 것이다.
- 교훈: 길이와 종료처럼 사용자 경험의 경계가 되는 규칙은 프롬프트의 "MUST" 가 아니라 상태와 코드로 둔다. 에이전트 사이에 넘기는 값은 받는 쪽의 테스트로 연결을 확인한다.

## 근거

- `docs/research/legacy/test-results/2026-03-15/3.session-pacing-fix-report.md`(v1 에서 v4, 8턴 실패 분석).
- `docs/research/legacy/test-results/2026-03-15/4.session-guide-integration-report.md`(에이전트 분리 뒤 통합, 제안 버튼 누락).
- `docs/research/legacy/v3/development/2026-03-15-bug-report.md`, `docs/research/legacy/PROJECT_PAUSE_2026-03-26.md` 4절 BUG-001.
- `apps/api/docs/ARCHITECTURE.md` 6절(세션 연속성).
