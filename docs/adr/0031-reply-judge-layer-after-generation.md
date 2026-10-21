---
id: ADR-0031
date: 2026-10-21
status: accepted
tags: [rust, server, conversation, llm, judge, cliche, data, config]
related: [ADR-0018, ADR-0022, ADR-0025, ADR-0027]
---
# 답의 상투성은 생성 뒤에 판정기가 재어 사실로 저장하고, 다음 턴의 규칙 입력과 동기 턴의 후보 고르기에만 쓴다

## 맥락

ADR-0027 은 이번 턴의 화법을 코드 규칙(`turn_style`)이 턴마다 정하고 지시문에 금지 목록을 두지 않기로 했다. 그래도 답이 나온 뒤에 "이 답이 일반 위로였는가"를 아는 길이 없어, 규칙은 상투구 사전과 어미 반복만 볼 수 있었다. ADR-0025 는 상투성 판정기로 Laya 파인튜닝(확률 센서, `/v1/systemone` 모양)을 골랐고 임계값 0.5 를 정했다(#26). #27 은 그 판정기를 서버에 붙이는 PRD 다.

## 결정

1. **자리는 생성 뒤다.** 답이 끝나 저장된 뒤에 판정기를 한 번 부른다. 스트림 턴의 응답 지연에는 더해지지 않고(스트림 종료 뒤), 판정이 실패하면 NULL 로 두고 대화는 그대로 간다. 스트림 턴은 다시 쓰지 않는다.
2. **판정은 사실로 저장하고 비율은 뷰다.** `turn_analyses` 에 `reply_label`, `reply_label_probability`(판정기가 준 그 라벨의 확률, 계산한 값이 아님), `reply_judge`(어느 판정기, 버전) 세 칸을 두고, 날짜별 라벨 비율은 뷰 `daily_reply_labels` 가 센다(루트 `CLAUDE.md` "데이터를 두는 원칙"). 위기 고정 문구 턴은 판정하지 않는다.
3. **쓰는 곳은 둘뿐이다.** (a) 다음 턴의 `TurnStyle`: 직전 답의 라벨이 `generic_comfort` 이고 확률이 임계값(기본 0.5, ADR-0025) 이상이면 "이번엔 사용자가 말한 구체 하나를 받는다" 줄을 더한다. (b) 동기 턴(`POST …/messages`)만 후보 N개(`REPLY_CANDIDATES`, 기본 1, 최대 3)를 병렬로 받아 `generic_comfort` 확률이 가장 낮은 것을 돌려준다. 고른 답만 저장하고 버린 후보는 `llm_calls` 에 호출 사실만 남는다(본문 없음).
4. **판정기는 설정으로 갈아 끼우고 기본은 끔.** `REPLY_JUDGE=off|haiku|systemone`(기본 `off`). `support` 는 trait `ReplyJudge` 만 보고 구현은 `llm` 에 둔다(`support → llm`, 위기 판정이 `safety → llm` 인 것과 같은 방향). `systemone` 은 HTTP `POST {SYSTEMONE_URL}/v1/systemone` 에 choice 질문 하나(Laya, Kev, Jev 가 같은 모양), 시간 제한 1초. `haiku` 는 기존 `TextModel` 로 라벨 하나를 받으며 확률이 없다.
5. **본문은 설정이 루프백일 때만 로컬 판정기로 간다.** `SYSTEMONE_URL` 이 루프백이 아니면 기동 때 경고를 남기되 막지는 않는다(Jev 를 기준선 비교에 쓸 수 있어야 한다). 제품의 기본 경로는 로컬 Laya 다.

## 버린 것

| 대안 | 버린 이유 |
|---|---|
| 생성 전에 판정기로 계획을 세우기 | 모델 계획 호출을 두지 않는다(ADR-0027). 생성 뒤 판정은 지연에 더해지지 않는다 |
| 스트림 턴도 후보를 받아 고르기 | 스트림은 첫 글자가 먼저 나가므로 고를 수 없다. 동기 턴에만 둔다 |
| 판정 비율을 칸으로 저장 | 계산한 값은 저장하지 않는다. 뷰가 센다 |
| 판정기를 `support` 안에 직접 구현 | 모델 호출의 방향(`support → llm`)이 흐트러진다. trait 로 받고 `llm` 이 구현한다 |
| 기본을 `systemone` 으로 켜기 | 로컬 판정 서버가 없으면 모든 턴에 실패 로그가 쌓인다. 켜는 것은 환경의 몫이다 |

## 결과

- `REPLY_JUDGE=off` 면 모든 기존 테스트와 실측 수치가 #18 마감과 같다.
- 판정 라벨은 chat-eval 의 `genericRate` 로 실측에 보이고, 운영 화면의 대화 계측이 뷰 `daily_reply_labels` 를 읽을 수 있다(화면은 다음 일).
- 개발 중 실측은 `systemone` 의 로컬 Laya 로 한다. Haiku 경로는 런타임 API 라 마감 실측 한 번만 돌리거나, API 를 쓰지 않기로 했으면 돌리지 않고 그렇게 적는다.
- `apps/server/CLAUDE.md` 설계 결정에 "답의 상투성 판정은 저장된 사실이고 다음 턴의 규칙 입력이다. 스트림 턴은 다시 쓰지 않는다" 한 줄을 둔다.

## 근거

- PRD #27 (서버의 살피기 층), PRD #26 과 ADR-0025 (판정기 선택과 임계값), ADR-0027 (코드 규칙 층).
- 실측: `outputs/decision/2026-10-21/report.md`(로컬).
