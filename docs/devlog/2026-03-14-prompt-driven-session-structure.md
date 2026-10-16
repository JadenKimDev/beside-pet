---
id: DEV-2026-03-14-prompt-driven-session-structure
date: 2026-03-14
tags: [conversation, prompt, orchestrator, repetition, legacy-mobile]
related: [ADR-0005, DEV-2026-03-15-session-guide-agent-pacing, DEV-2026-03-17-real-user-breaks-sim-scores]
---
# 대화의 구조를 프롬프트로 잡으려 했더니, 반복 질문이 모양만 바꿔 계속 돌아왔다

## 맥락

모바일 시기의 대화는 세션 평균 8턴 안팎에서 끝났고 10턴쯤부터 지루해졌다. 3월 3일 설계는 "AI 가 직전 메시지에만 반응한다"고 진단하고, 사용자가 말한 장면을 원문으로 기억하는 이벤트 메모리와 세션 시작 시나리오를 넣기로 했다(목표 15턴 이상, 반복 질문 0%). 3월 14일 하루 동안 첫 세션 프롬프트와 20턴 대화를 여러 판으로 고쳐 가며 쟀다.

## 해 본 것

첫 세션(v1 에서 v5):

1. v2 3.4점, v3 3.6점.
2. v4(한국어)는 1.5점으로 무너졌다. 매 턴 `systemPromptOverride` 로 첫 세션 프롬프트를 다시 넣었더니 모델이 매 턴을 "새 대화 시작"으로 읽고 자기소개를 되풀이했다. 맥락을 "Follow your first_encounter_flow" 로 줄인 것도 흐름을 처음부터 다시 돌게 했다.
3. v5 는 덮어쓰기를 없애고 둘째 턴부터 일반 프롬프트로 고정했으며, 제안 버튼(suggestedActions)은 서버가 할 일 목록에서 만들게 했다. 한국어 4.0, 영어 4.5.

20턴 대화(v1 에서 v4):

1. v1: 장난감 이야기 질문이 9턴부터 16턴까지 7턴 반복.
2. v2(후속 질문이 셋 이상이면 깊이 2로 자동 승격): 반복이 "다독임" 질문의 변형 여섯 가지로 바뀌었다. 같은 문장만 추적해서 뜻이 같은 질문을 막지 못했다.
3. v3(intake 흐름): 네 단계 흐름은 생겼지만 "루틴 계획"이 7턴 반복됐고, "고마워요"를 네 번 들어도 끝내지 않았다.
4. v4(깊은 intake, 조언 금지): "그리움과 죄책감"이 4번, "위로와 아픔"이 3번 반복됐고 감사 표현 6번에도 끝내지 않았다.

## 결과

- 프롬프트를 고칠 때마다 반복의 겉모양만 바뀌었다. v4 보고서는 "프롬프트 문제가 아니다"라고 적었다. 이벤트 메모리는 앞쪽 턴(0에서 1)의 장면에만 쏠렸다.
- 시스템 프롬프트를 매 턴 덮어쓰면 모델은 대화가 새로 시작된 것으로 읽는다. 단계 정보는 덮어쓰기가 아니라 매개변수로 넣는다.
- 진행과 반복 방지는 모델이 기억하고 판단할 일이 아니었다. 웹 API 는 이것을 코드로 옮겼다. 단계는 상태로 두고, 한 단계의 턴 수에 하한과 상한을 두며, 비몰입이 이어지면 넘어간다(ADR-0005). "같은 질문을 하지 말라"는 규칙 대신 같은 자리에 머물 수 있는 턴 수 자체를 제한한 것이다.
- 문장 일치로 반복을 막는 방식은 의미가 같은 질문을 못 막는다. 반복을 재려면 의미 단위로 세야 한다.

## 근거

- `docs/research/legacy/v2/development/대화_품질_개선_설계.md`(2026-03-03 진단과 목표).
- `docs/research/legacy/test-results/2026-03-14/6.first_session_v2-local.md`, `docs/research/legacy/test-results/2026-03-14/7.first_session_v3-local.md`, `docs/research/legacy/test-results/2026-03-14/8.first_session_ko_v4-local.md`, `docs/research/legacy/test-results/2026-03-14/9.v5-todo-architecture.md`.
- `docs/research/legacy/test-results/2026-03-14/11.dynamic-e2e-ko-20turn.md`, `docs/research/legacy/test-results/2026-03-14/12.dynamic-e2e-ko-20turn-v2.md`, `docs/research/legacy/test-results/2026-03-14/13.dynamic-e2e-ko-20turn-v3-intake.md`, `docs/research/legacy/test-results/2026-03-14/14.dynamic-e2e-ko-20turn-v4-deep-intake.md`, `docs/research/legacy/test-results/2026-03-14/1.pet_loss_grief.md`(이벤트 메모리 쏠림).
