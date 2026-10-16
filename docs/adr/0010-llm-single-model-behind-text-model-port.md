---
id: ADR-0010
date: 2026-10-16
status: accepted
tags: [llm, provider, cost, architecture]
related: [ADR-0004, ADR-0005, ADR-0011, DEV-2026-03-02-counselor-model-ab-test, DEV-2026-03-15-user-simulator-flips-ranking, DEV-2026-03-16-model-specific-prompts]
---
# 웹 API 는 모든 모델 호출을 한 관문(TextModelPort) 뒤에 두고, 지금은 Claude Haiku 4.5 한 모델로 발화, 위기 판정, 리포트를 모두 한다

## 맥락

모바일 시기에 상담 모델은 Gemini 2.5 Flash 에서 시작해 Claude Haiku 4.5, GPT-5 mini 를 오갔고, 위기 감지와 분석과 리포트는 역할마다 다른 Gemini 모델이 맡았다(ADR-0011). 비교 실측은 날마다 결론이 바뀌었다. 2026-03-02 A/B 에서는 비용 때문에 GPT-5 mini 가 이겼고(DEV-2026-03-02-counselor-model-ab-test), 3월 15일과 16일에는 Haiku 가 품질 1순위였으며(DEV-2026-03-15-user-simulator-flips-ranking), Gemini Flash 는 전용 프롬프트를 쓰면 싸고 빨랐다(DEV-2026-03-16-model-specific-prompts). 모델이 바뀔 때마다 프롬프트와 흐름이 같이 흔들린 것이 가장 큰 비용이었다. 웹 API 는 흐름을 코드로 옮겼으므로(ADR-0005) 모델은 단계 안의 발화만 맡으면 됐다.

## 결정

- **한 관문.** 모든 모델 호출은 `TextModelPort` 와 `ModelRouter` 를 지난다. 요청마다 `ModelRef`(제공자, 모델)를 싣고 다니므로 역할별 모델 교체가 호출부를 고치지 않고 된다. 호출별 토큰과 비용은 `UsageSink` 가 적는다. 관측(Langfuse)도 이 관문에 데코레이터 하나로 붙인다.
- **한 모델.** 기본은 Claude Haiku 4.5(`claude-haiku-4-5`)다. 공감 발화, 위기 판정, Planner, Summarizer, 마음 리포트가 모두 같은 모델을 쓴다. 기본 모델은 `LLM_PROVIDER`, `LLM_MODEL` 이 먼저이고, 없으면 `CLAUDE_MODEL`(호환용)을 본다.
- **라이브 전용.** 키 없이는 기동하지 않는다. 가짜 모델로 조용히 도는 모드를 두지 않는다. 발화 생성의 실패는 오류로 올리고, 위기 판정만 키워드 폴백을 둔다(ADR-0004).
- **키는 서버에만.** 웹은 모델을 직접 부르지 않는다.

## 버린 것

| 안 | 이유 |
|---|---|
| GPT-5 mini 를 상담 기본으로(모바일 시기 2026-03-02 결정) | 30턴 비용은 Haiku 의 3분의 1이었지만, 응답이 길게 늦고(턴 평균 8에서 9초, 첫 인사 18초 안팎) 규칙과 self-check 를 지키지 않는 일이 반복됐다 |
| Gemini Flash 를 상담 기본으로 | 싸고 빠르지만 모델 전용 프롬프트가 있어야 했고, 시뮬레이터 점수가 실제 대화에서 재현되는지 확인되지 않았다 |
| 역할마다 다른 제공자(모바일 시기) | 제공자가 셋이면 키, 과금, 개인정보 처리자 고지, 장애 지점이 셋이다 |
| 첫 세션만 상위 모델(Sonnet)로 전환 투자 | 결제가 없는 웹에서는 의미가 없다(ADR-0013) |
| 프레임워크(LangChain, LangGraph)로 호출 추상화 | 관문 하나와 포트로 충분하다. 흐름을 프레임워크 그래프에 두지 않기로 했다(ADR-0005) |

## 결과

- 2026-10-16 사용자는 Claude Haiku 를 Ollama 로 띄운 모델로 바꾸고 API 를 Rust 로 옮길 계획이다. 어떤 모델을 쓸지, 어디서 띄울지, 포팅과 모델 교체의 순서는 정하지 않았다. 정해지면 이 글을 대신하는 새 ADR 을 쓴다. 다만 레포의 원칙상 Rust 포팅은 동작을 바꾸지 않으므로, 모델 교체는 포팅과 다른 PRD 로 두는 것이 자연스럽다.
- 모델을 바꿀 때 먼저 잴 것: 위기 판정 프롬프트가 같은 답을 내는가(ADR-0004), 대화 언어(ko, en)를 지키는가, 진솔한 답의 판정이 깊이 게이트와 맞는가, 응답 지연. 모바일 시기의 교훈대로 사용자 시뮬레이터의 질이 점수를 좌우하므로, 실제 사람이 한 번은 대화해 본다.
- 프롬프트는 모델마다 다시 맞춰야 할 수 있다. 모바일 시기에 GPT 전용, Gemini 전용 프롬프트를 따로 만든 일이 있었다.

## 근거

- `apps/api/src/llm/`(포트, 라우터, Anthropic 제공자, 사용량 기록), `apps/api/src/support/infrastructure/llm/reply-composer.adapter.ts`(`DEFAULT_MODEL`, 환경 변수 우선순위).
- `apps/api/docs/02-architecture.md` 5절, `apps/api/docs/ARCHITECTURE.md` 7절, `apps/api/README.md` 의 "모델 운용".
- `docs/research/2026-10-16-deploy-analysis.md`: 운영 LLM 은 Anthropic 만.
- 모바일 시기의 선택 근거: `docs/research/legacy/2026-03-02-지시사항분석.md` 4절, `docs/research/legacy/test-results/2026-03-15/8.interactive-e2e-ko-haiku-claude-sim.md`, `docs/research/legacy/test-results/2026-03-16/12.gemini-flash-optimized-prompt-test.md`, `docs/research/legacy/v3/development/AI_프롬프트_테스트_가이드.md`.
- Ollama 와 Rust 계획: 2026-10-16 사용자의 말(세부는 미정).
