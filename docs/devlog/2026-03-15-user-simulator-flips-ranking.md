---
id: DEV-2026-03-15-user-simulator-flips-ranking
date: 2026-03-15
tags: [llm, evaluation, simulator, provider, legacy-mobile]
related: [ADR-0010, DEV-2026-03-02-counselor-model-ab-test, DEV-2026-03-17-real-user-breaks-sim-scores]
---
# 사용자 역할의 시뮬레이터를 바꾸자 모델 비교의 결론이 뒤집혔다

## 맥락

모바일 시기에 GPT-5 mini 와 Claude Haiku 4.5 를 한국어 20턴 대화로 비교했다. 사용자 역할은 처음에 GPT-4o-mini 가 맡았다.

## 해 본 것

1. GPT-4o-mini 를 사용자로: GPT-5 mini 3.6점(감사 신호 13번에도 끝내지 않음, 반복 4번, 평균 8.9초), 다른 런에서 3.9점. Haiku 3.5점, 11턴.
2. Haiku 의 em-dash 9회를 들여다보니 Claude 용 프롬프트에 문체 블록(writingStyleBlock)을 빠뜨린 코드 누락이었다. 모델 탓이 아니었다.
3. 사용자 역할을 Claude Code(대화형 시뮬레이터)로 바꿨다: GPT-5 mini 4.6점(평균 8.5초), Haiku 5.0점(평균 4.5초, 5초 이하 턴 76%, 다룬 주제 13개 중 12개).

## 결과

- 같은 두 모델의 순위와 점수 차가 시뮬레이터에 따라 달라졌다. 그날 문서는 "Haiku 4.5 가 모든 지표에서 앞선다"며 Haiku 를 기본으로 되돌리길 권했다. 3월 2일의 GPT-5 mini 채택(DEV-2026-03-02-counselor-model-ab-test)이 뒤집혔다.
- 프롬프트가 모델마다 따로 있으면 한쪽에만 빠진 블록이 모델 차이로 보인다. 비교 전에 두 프롬프트의 구성 요소가 같은지 먼저 맞춘다.
- 교훈: 시뮬레이터의 질이 모델 평가를 좌우한다. 협조적이고 말이 많은 시뮬레이터는 짧은 답, "몰라", 비협조적인 응답을 시험하지 못한다. 이틀 뒤 실제 사람과의 대화에서 이 점수는 다시 무너졌다(DEV-2026-03-17-real-user-breaks-sim-scores).
- 모델을 바꿀 계획(ADR-0010)이 있으므로, 비교 때는 시뮬레이터를 고정하고, 짧은 답과 비몰입 답을 섞은 대본을 두고, 실제 사람이 한 번은 대화해 본다.

## 근거

- `docs/research/legacy/test-results/2026-03-15/2.dynamic-e2e-ko-haiku-comparison.md`, `docs/research/legacy/test-results/2026-03-15/5.dynamic-e2e-ko-20turn-session-guide.md`, `docs/research/legacy/test-results/2026-03-15/6.dynamic-e2e-ko-20turn-gpt5mini.md`.
- `docs/research/legacy/test-results/2026-03-15/7.interactive-e2e-ko-gpt5mini-claude-sim.md`, `docs/research/legacy/test-results/2026-03-15/8.interactive-e2e-ko-haiku-claude-sim.md`.
