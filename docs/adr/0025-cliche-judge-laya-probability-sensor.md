---
id: ADR-0025
date: 2026-10-21
status: accepted
tags: [llm, judge, cliche, laya, haiku, eval, dataset, license]
related: [ADR-0004, ADR-0010, ADR-0016, ADR-0022, DEV-2026-03-15-user-simulator-flips-ranking]
---
# 상투성 판정기는 우리 데이터로 파인튜닝한 Laya(multilingual)를 확률 센서로 쓴다. 라벨은 넷, 재료는 지어낸 전사와 합성 답뿐이다

## 맥락

동반자의 답이 누구에게나 통하는 위로로 흐르는 것(상투성)을 런타임에서 알아차려 답을 한 번 더 뽑는 "살피기 층"을 두려 한다. 그러려면 답 하나를 받아 "상투적인가"를 확률로 돌려주는 판정기가 필요하다. 문자열 수준(상투구 사전)은 chat-eval 의 검사(#18)가 이미 보므로, 여기서는 담화 수준만 본다.

조사(`docs/research/2026-10-21-jev-open-models-lora.md`)의 결론은 Jev 는 가중치가 없고 한국어 수치가 없으며, 이 Mac 에서 도는 공개 모델은 Laya 계열(322M~421M, Apache-2.0)이고, 제로샷은 n=4 로 방향만 맞았다는 것이었다. 유닛블랙의 실측(2026-10-14)은 합성 문장 1,015건으로 Laya 를 56%→95% 로 올렸다. #26 은 (1) 라벨 데이터를 만들고 (2) 후보를 같은 평가셋으로 재고 (3) 붙일 판정기와 임계값을 정하는 PRD 다. 하네스는 `dev-tools/decision/`(README 에 절차), 수치의 정본은 `outputs/decision/2026-10-21/report.md`(로컬)다.

## 결정

- **라벨은 choice 하나, 넷이다.** `generic_comfort`(보호자가 말한 구체 없이 누구에게나 통하는 위로·안심이 주), `specific_reflection`(보호자가 말한 구체를 되받는 것이 주), `question`(묻는 것이 주. 되받는 문장이 하나뿐이고 질문(괄호의 예시 포함)이 이어지면 question, 둘 이상이면 specific_reflection), `crisis_fixed`(위기를 알아차리고 도움받을 곳을 안내하는 답. 고정 문구에 한정하지 않는다. 평가와 학습에서 제외). 문자열은 `dev-tools/decision/src/decision/schema.py` 한 곳에 있고 검증기가 비교한다.
- **재료는 지어낸 글뿐이다.** `outputs/chat-eval/**/*.run.json`(QA 계정의 지어낸 인물 대화) 150건과, 전사가 모자라 합성한 464건(`source: "synthetic-haiku"`. 런타임과 같은 모델 Haiku 를 구독 `claude -p` 로 부르고, 서버의 발화 지시문 `reply.rs` 와 인물 파일의 지어낸 말을 넣어 만든 답). 614건, 합성 비율 75.6%. 실제 사용자 세션은 어떤 경로로도 재료에 넣지 않는다(루트 `CLAUDE.md` "읽지 않는 것"). 전사 재료 경로는 코드에 고정돼 있고 인자로 바꿀 수 없다. `chat:eval` 을 재료 때문에 더 돌리지 않는다(API 는 런타임만, 개발 작업은 구독).
- **라벨은 Claude Code 팀원 둘(Opus)이 독립적으로 붙이고 팀장이 불일치를 가른다.** 일치율 0.94, Cohen's κ 0.91(기준 0.6), 불일치 37건. 분할은 인물 단위(같은 인물이 양쪽에 들어가지 않게) 학습 7명 481건, 평가 2명 133건(chat-eval 33, 합성 100).
- **런타임 판정기는 `convaiinnovations/laya-multilingual` 을 우리 라벨로 파인튜닝한 모델이다**(8 에폭, micro-batch 1 × 누적 4, 옵션 섞기, 온도 보정. `pnpm decision:train --epochs 8 --grad-accum 4`). 평가셋에서 정확도 82.7%, generic_comfort F1 0.92, ECE 0.09, 지연 p50 35ms(Mac MPS), 옵션 순서 민감도 3.8%. PRD 의 수용 기준 85% 에는 못 미치지만 다른 후보보다 모든 지표에서 앞서고 확률을 준다. PRD 의 "85% 미달이면 Haiku" 는 Haiku 가 더 나을 것이라는 전제였고 수치가 그 전제를 깼다. **한계**: 85% 미달(82.7%), 평가셋 n=133(±6%p), 합성 비율 75%(chat-eval 출처만 보면 75.8%), 합성과 평가 재료를 같은 모델(Haiku)이 만들어 점수 과대의 가능성, 보정 온도가 laya 의 상한(5.0)에 닿음, laya-ko 는 라이선스(KLUE CC BY-SA 가능성)로 제외. 모델 파일은 `dev-tools/decision/data/models/`(gitignore)에 두고 레포에 넣지 않는다. 서버는 `laya serve`(`/v1/systemone`)를 HTTP 로 부른다. 붙이는 일은 다음 PRD(살피기 층)다.
- **임계값: `generic_comfort` 확률 0.5 이상이면 상투적이라고 본다.** 틀렸을 때의 비용이 답을 한 번 더 뽑는 것뿐이라 보수적으로 잡지 않는다. 평가셋에서 0.5 는 정밀도 0.94, 재현율 0.84(133건 중 33건 표시), 0.3 은 0.89/0.89 다. 재현율을 더 원하면 0.3~0.4 로 내린다.
- **판정기는 정답기가 아니라 확률 센서다.** 판정이 답을 막거나 바꾸지 않고, 다시 뽑을지의 신호일 뿐이다. 확신하며 틀리는 답(유닛블랙의 보류 이유)이 있어도 사용자에게 닿는 것은 동반자의 답이지 판정이 아니다. 판정 결과는 모델 호출 기록(ADR-0022)처럼 사실로만 적고 해석을 저장하지 않는다.
- **Haiku 프롬프트 판정기는 보조·대조용이다.** 프롬프트 정본은 `dev-tools/decision/src/decision/judges/claude.py` 의 `SYSTEM_PROMPT` 와 `USER_PROMPT_TEMPLATE` 이고, 서버에 Haiku 판정기를 둔다면 같은 문자열을 쓴다. 평가셋 정확도 69.9%, 확률 없음, 순서 민감도 15%.
- **채택 후보는 `laya-multilingual` 기반뿐이다.** `2nugu/laya-ko` 는 가중치가 Apache-2.0 이지만 모델 카드가 학습 재료로 KLUE(CC BY-SA 4.0)와 AI-Hub 말뭉치를 밝히고 파생 여부를 밝히지 않아 비교용으로만 잰다(파인튜닝 81.2%). `AlquimiaAi/openjev`(CC BY-NC)는 쓰지 않는다.

## 수치 (2026-10-21, 평가셋 133건)

| 판정기 | 정확도 | chat-eval / 합성 | generic F1 | 매크로 F1 | ECE | 지연 p50 | 순서 민감도 |
|---|---|---|---|---|---|---|---|
| claude haiku(프롬프트 2판) | 69.9% | 72.7% / 69.0% | 0.46 | 0.65 | 확률 없음 | 3.6s(`claude -p` 기동 포함) | 15.0% |
| claude opus(비교용) | 78.2% | 75.8% / 79.0% | 0.58 | 0.75 | 확률 없음 | 3.6s | 4.5% |
| laya-ko 제로샷 | 36.1% | 39.4% / 35.0% | 0.33 | 0.36 | 0.43 | 37ms | 36.8% |
| laya-multilingual 제로샷 | 34.6% | 36.4% / 34.0% | 0.51 | 0.38 | 0.19 | 37ms | 45.9% |
| laya-ko 파인튜닝 4ep(비교용) | 81.2% | 72.7% / 84.0% | 0.88 | 0.82 | 0.15 | 37ms | 3.8% |
| laya-multilingual 파인튜닝 4ep | 76.7% | 69.7% / 79.0% | 0.80 | 0.77 | 0.16 | 36ms | 8.3% |
| **laya-multilingual 파인튜닝 8ep·누적 4** | **82.7%** | 75.8% / 85.0% | **0.92** | 0.83 | **0.09** | 35ms | 3.8% |

haiku 프롬프트 1판은 54.1% 였다. 오류의 대부분(59건 중 43건)이 "짧은 되받기 한 문장 + 질문"을 specific_reflection 으로 읽는 것이라, 라벨러 둘이 쓴 경계 규칙을 시스템 프롬프트에 넣은 것이 2판이다(1판 결과는 `outputs/decision/2026-10-21/prompt-v1/`). 2판에서 남은 오류는 generic_comfort 를 question 으로 읽는 것(37건 중 15건)이다. Anthropic API 호출은 0건이다(하네스에 API 클라이언트가 없다).

## 버린 것

| 안 | 이유 |
|---|---|
| Jev API | 가중치 없음, 한국어 수치 없음, early access 대기열. 대화 본문을 외부로 보내는 것도 피하고 싶다 |
| 런타임 Haiku 프롬프트 판정기만 | 69.9% 에 확률이 없어 임계값을 둘 수 없고 호출마다 비용·지연이 든다 |
| Kev-0.8B 클라우드 파인튜닝 | 미실측(사용자 결정 대기). PRD 는 Laya 가 85% 에 못 미치면 한 번 재라고 했으나 클라우드 GPU 결제가 사용자 몫이다. 재면 같은 하네스(`systemone` 판정기)로 재고 이 표에 더한다 |
| `2nugu/laya-ko` 기반 채택 | KLUE(CC BY-SA) 파생 여부 불명 |
| 라벨을 Jev 의 soft label 로 | 대화 본문(지어낸 것이라도 제품의 발화)을 외부로 보내지 않는다는 선, 그리고 Jev 대기열 |
| 재료를 늘리려 `chat:eval` 을 여러 번 | API 는 런타임만 쓴다(사용자 지시 2026-10-21). 합성으로 대신했다 |
| 라벨을 사람(사용자)이 | 개발 자료라 Claude Code 팀원이 붙여도 되고 κ 0.91 로 충분했다 |

## 결과

- 다음 PRD(살피기 층)는 이 ADR 의 모델(`laya-cliche-2026-10-21-multilingual-e8`), 임계값 0.5, `laya serve` 호출, 그리고 "확률 센서" 원칙을 그대로 쓴다.
- 발화 프롬프트나 모델을 바꾸면 답의 분포가 달라지므로 `pnpm decision:eval` 로 다시 재고 이 표를 고친다(chat-eval 스킬 8절).
- 라벨 정의를 고치면 후보를 다시 뽑고 다시 라벨한다(검증기가 criteria 문자열을 비교한다).
- 학습·평가는 이 Mac 에서 돈다. 학습 8 에폭 약 7분(MPS).

## 근거

- 평가 보고서와 원 결과: `outputs/decision/2026-10-21/report.md`, `*.jsonl`, `train-*.md`(로컬).
- 라벨과 분할: `dev-tools/decision/data/labels/{a,b,final,disagreements}.jsonl`, `data/split.json`(추적).
- 조사: `docs/research/2026-10-21-jev-open-models-lora.md`(로컬). 유닛블랙 기술 블로그 2026-09-29, 2026-10-14.
- 라이선스: Laya 코드·가중치, mmBERT Apache-2.0(LICENSE, 모델 카드). `2nugu/laya-ko` 모델 카드.
