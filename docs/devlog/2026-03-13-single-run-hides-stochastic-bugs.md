---
id: DEV-2026-03-13-single-run-hides-stochastic-bugs
date: 2026-03-13
tags: [testing, llm, e2e, legacy-mobile]
related: [DEV-2026-03-14-prompt-driven-session-structure, DEV-2026-03-14-language-switch-was-test-script]
---
# 같은 시나리오를 세 번 돌려서야 구조적 버그와 확률적 버그가 갈렸다. 로컬과 배포 서버의 지연도 세 배 넘게 달랐다

## 맥락

모바일 시기 3월 13일과 14일, 상담 대화를 끝에서 끝까지 돌리는 시나리오 테스트를 처음 체계적으로 했다. 모델은 GPT-5 mini, 시나리오는 펫로스 슬픔과 안락사 죄책감이었다.

## 해 본 것

1. 같은 시나리오를 두 번, 비슷한 시나리오를 한 번 더 돌려 결과를 나란히 놓았다.
2. 다음 날 같은 시나리오를 로컬 서버와 배포(dev) 서버에서 돌려 비교했다.
3. 안락사 죄책감 시나리오를 Claude Haiku 4.5 로도 돌렸다.

## 결과

- 두 번 모두 나온 것(구조적): 첫 인사에서 사용자가 아직 말하지 않은 온보딩 정보를 먼저 꺼냄(2/2), em-dash 남발(21회, 11회), 한 응답에 질문 둘.
- 한 번만 나온 것(확률적): "For Step 4:" 같은 내부 단계 라벨이 사용자에게 노출됨(1/2).
- 품질 점수 4.0 과 3.5, 평균 응답 5.63초와 4.71초, 최대 11.64초. 첫 인사는 17.89초에서 18.26초였다.
- 로컬과 배포: 세션 시작 4.99초 대 18.26초, 평균 응답 3.65초 대 6.08초, 최대 4.96초 대 15.20초. 로컬은 Vertex AI 인증이 없어 리포트 생성이 매번 실패했다.
- Haiku 대 GPT-5 mini(안락사 죄책감): 종합 4.3 대 3.7, 평균 4.20초 대 5.02초, 10번째 턴 3.72초 대 14.66초. "이 감정을 평생 안고 살 수 있을지 모르겠다"는 문장에 Haiku 만 위기 경고를 띄웠다. 대신 Haiku 는 반려 기간 12년을 20년으로 잘못 말했다.
- 교훈: LLM 대화 테스트는 한 번 돌려서 결론을 내지 않는다. 같은 입력을 여러 번 돌려 재현 비율을 적는다. 지연은 로컬이 아니라 실제 배포 경로에서 잰다. 로컬에서 외부 인증이 없어 실패하는 기능은 테스트 결과에서 따로 표시한다.
- 위기 판정이 모델마다 다르게 걸린 것은 위기 감지를 한 모델에 맡기지 않고 키워드와 겹으로 두는 이유가 됐다(ADR-0004).

## 근거

- `docs/research/legacy/test-results/2026-03-13/4.comparison-run1-run2.md`, `docs/research/legacy/test-results/2026-03-13/1.pet_loss_grief.md`, `docs/research/legacy/test-results/2026-03-13/2.pet_loss_grief-run2.md`, `docs/research/legacy/test-results/2026-03-13/3.euthanasia_guilt-run3.md`.
- `docs/research/legacy/test-results/2026-03-14/2.pet_loss_grief-local.md`, `docs/research/legacy/test-results/2026-03-14/3.euthanasia_guilt-local.md`, `docs/research/legacy/test-results/2026-03-14/4.euthanasia_guilt-haiku.md`.
