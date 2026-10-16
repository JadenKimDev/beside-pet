---
id: ADR-0011
date: 2026-03-15
status: superseded
tags: [llm, provider, agents, legacy-mobile]
related: [ADR-0005, ADR-0010, ADR-0009, DEV-2026-03-15-session-guide-agent-pacing, DEV-2026-03-13-doc-code-mismatch]
---
# 모바일 시기에는 역할마다 다른 모델의 에이전트를 두었다(상담 GPT-5 mini, 나머지 Gemini)

> `superseded`: 웹 API 의 단일 모델과 한 관문(ADR-0010), 코드가 쥔 흐름(ADR-0005)으로 대신했다. 같은 구성을 다시 고려할 때 무엇이 비쌌는지 알아 두려고 남긴다.

## 맥락

2026년 3월의 모바일 API 는 상담 품질, 비용, 지연을 한꺼번에 맞추려고 역할마다 가장 싸거나 빠른 모델을 골랐다. Google Vertex AI 크레딧(2027년 2월까지)을 쓰려는 이유도 있었다.

## 결정

당시의 구성(2026-03-15 SupervisorAgent 를 둘로 나눈 뒤):

| 에이전트 | 모델 | 역할 |
|---|---|---|
| Counselor | GPT-5 mini 기본, Claude Haiku 4.5 와 Gemini Flash 대체(`COUNSELOR_PROVIDER`) | 상담 발화 |
| SafetyGuard | gemini-2.5-flash | 위기 감지 |
| SessionGuideAgent | Gemini Flash | 할 일 목록, intake 체크리스트, 토픽 주입 |
| AnalystAgent | gemini-2.5-pro(us-central1) | 사후 분석(감정, 구조화 데이터) |
| Illustration | gemini-2.0-flash-exp | 리포트와 편지 |
| Audio Transcription | gemini-2.5-flash | 음성을 글로 |

상담 모델은 GPT-5 mini(`reasoning_effort: minimal`)를 쓰고 프롬프트도 GPT 전용으로 따로 두었다.

## 버린 것

당시 버린 안: 단일 모델(비용), Gemini 2.5 Pro 상담(첫 토큰 3초 이상), Claude Haiku 3.5(2026-02-19 은퇴).

## 결과

- 제공자 셋, 프롬프트 여러 벌, 에이전트 여섯이 서로의 출력에 기댔다. 세션 노트의 다음 주제가 다음 세션에 전달되지 않고, 구현한 진행 평가가 연결되지 않은 채 남는 식의 이음새 버그가 생겼다(DEV-2026-03-15-session-guide-agent-pacing).
- 모델 선택이 며칠마다 바뀌었다. 3월 15일과 16일의 문서는 Haiku 를 1순위로 권했는데 3월 17일 실사용 세션은 Gemini Flash 로 돌았고, 최종 결정을 적은 문서는 없다.
- 개인정보 문서가 실제 처리자(OpenAI)를 빠뜨렸다(DEV-2026-03-13-doc-code-mismatch). 제공자가 늘면 고지할 곳도 는다.
- 웹 API 는 이 구성 대신 한 모델, 한 관문으로 갔다(ADR-0010).

## 근거

- `docs/research/legacy/PROJECT_PAUSE_2026-03-26.md` 3절 "AI 에이전트 시스템", 9절(역할 분리 2026-03-15 결정).
- `docs/research/legacy/2026-03-02-지시사항분석.md` 4절과 "기술적 참고 사항"(역할별 모델, Vertex 크레딧).
- `docs/research/legacy/v3/문서_코드_불일치_분석_리포트.md` M-2.
- `docs/research/legacy/project-reference/legacy-CLAUDE.md` 의 기술 스택.
