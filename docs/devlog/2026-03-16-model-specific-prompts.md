---
id: DEV-2026-03-16-model-specific-prompts
date: 2026-03-16
tags: [llm, prompt, gemini, gpt, reasoning, legacy-mobile]
related: [ADR-0010, DEV-2026-02-23-prompt-shrink-did-not-fix-flash, DEV-2026-03-15-user-simulator-flips-ranking]
---
# GPT-5 mini 는 추론 노력을 올려도 죄책감 리프레임을 하지 못했고, Gemini Flash 는 전용 프롬프트를 쓰자 뒤집혔다

## 맥락

안락사 뒤의 죄책감에 갇힌 사용자에게 제때 관점을 바꿔 주는 말(리프레임)이 필요했다. GPT-5 mini 는 같은 죄책감 질문을 4턴 연속 되풀이했다. 같은 날 Gemini 2.5 Flash 를 상담 모델 후보로 다시 쟀다.

## 해 본 것

GPT-5 mini:

1. 프롬프트를 고쳐 직접 질문에 답하는 문제는 풀었다(4.0점, 평균 9.5초, 첫 턴 31.4초). 죄책감 루프는 그대로 4턴.
2. `reasoning_effort` low 와 출력 1024토큰: 9.5초, 리프레임 없음.
3. medium 과 1024토큰: 빈 응답. 추론 토큰이 출력 한도를 다 썼다.
4. medium 과 4096토큰: 25.8초(첫 턴 40.1초), 리프레임 없음, 같은 질문 3번.

Gemini 2.5 Flash:

1. 기본 프롬프트: 2.9초, 6턴 중 질문 0번, 3.5점.
2. GPT 용 프롬프트: 3.7초, 질문 1번, 3.8점.
3. Gemini 전용 프롬프트(좋은 예시 9개와 나쁜 예시 2개, 턴 번호에 맞춘 죄책감 대응 절차, 질문 은행 8개, self-check 를 3항목으로 축소): 3.7초, 7턴 중 질문 6번, 3번째 턴에 제때 리프레임, 4.5점.
4. 첫 세션 전용 프롬프트까지 만들어 20턴: 평균 4.1초, JSON 100% 유효.

## 결과

- 추론 모델에서 추론 노력을 올리면 지연만 크게 늘고 행동은 그대로였다. 출력 토큰 한도를 추론이 먹어 빈 응답이 나오는 함정도 있었다. 보고서는 "GPT-5 mini 는 self-check 를 실행하지 않고, 규칙보다 예시를 따른다"고 적고, 리프레임은 서버가 시점을 정해 주입하라고 권했다.
- Flash 는 2월 23일에 "생각 단계 없이는 질문하지 않는다"고 진단됐던 같은 설정(DEV-2026-02-23-prompt-shrink-did-not-fix-flash)에서, 예시 중심의 전용 프롬프트로 질문을 했다. 문제는 모델의 한계라기보다 다른 모델용 프롬프트를 그대로 쓴 데 있었다.
- 비용 비교(상대값): Haiku 1, Flash 약 0.3, GPT-5 mini 약 0.8. 그날의 권고는 1순위 Haiku, 비용 대안 Flash(전용 프롬프트 필수), 장애 대비 GPT-5 mini 였다.
- 교훈: 모델을 바꾸면 프롬프트도 그 모델용으로 다시 쓴다. 규칙 문장과 self-check 보다 좋은 예와 나쁜 예가 잘 듣는다. "언제 무엇을 할지"(리프레임 시점, 단계 전이)는 모델이 아니라 서버가 정하는 편이 확실하다(ADR-0005). Ollama 모델로 바꿀 때(ADR-0010)도 같은 순서로 잰다.

## 근거

- `docs/research/legacy/test-results/2026-03-15/9.interactive-e2e-ko-gpt5mini-prompt-improved.md`, `docs/research/legacy/test-results/2026-03-16/10.gpt5mini-guilt-reframe-test.md`.
- `docs/research/legacy/test-results/2026-03-16/11.gemini-flash-counselor-test.md`, `docs/research/legacy/test-results/2026-03-16/12.gemini-flash-optimized-prompt-test.md`, `docs/research/legacy/test-results/2026-03-16/13.gemini-flash-first-session-test.md`, `docs/research/legacy/test-results/2026-03-16/14.gemini-flash-first-session-20turn-test.md`.
