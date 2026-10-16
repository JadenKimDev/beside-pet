---
id: ADR-0016
date: 2026-10-16
status: accepted
tags: [llm, provider, ollama, anthropic, rust, server, safety]
related: [ADR-0004, ADR-0010, ADR-0015]
---
# Rust 서버의 모델 관문은 Anthropic 과 Ollama 두 공급자를 두고, 기본 공급자의 설정만 기동에 요구한다

## 맥락

ADR-0010 은 모든 모델 호출을 한 관문(`TextModelPort`, `ModelRouter`) 뒤에 두고, 지금은 Claude Haiku 4.5 한 모델로 모든 일을 하며 키가 없으면 기동하지 않는다고 정했다. 그 뒤 사용자는 이 머신의 Ollama 모델(gemma4)을 목표로 두었고(열린 이슈 #3), 서버는 Rust 로 다시 쓰는 중이다(ADR-0015). Rust 서버의 모델 PRD(#9)는 TS 를 그대로 옮길지(Anthropic 만, 키 필수) 다시 설계할지를 골라야 했다. #3 의 실측(2026-10-16, M4 Pro 48GB)에서 gemma4 는 생각(thinking)을 켜 두면 출력 상한을 생각에 다 쓰고 답이 비었고, 끄면 38토큰 답이 1.0초에 왔다.

## 결정

- **공급자 둘.** `llm` 에 Anthropic(Messages API)과 Ollama(`/api/chat`) 공급자를 둔다. 라우터는 기본 `ModelRef`(공급자, 모델)의 공급자로 호출을 보낸다. 등록은 설정이 있는 것만 한다: Anthropic 은 키가 있을 때, Ollama 는 늘. #3 을 TS 로 다시 하지 않고 이 결정이 흡수한다.
- **기본 모델 고르기.** `LLM_PROVIDER`/`LLM_MODEL` 이 먼저이고, 없으면 `CLAUDE_MODEL`(공급자 anthropic), 그것도 없으면 `claude-haiku-4-5` 다(TS 와 같은 우선순위에 `ollama` 를 더함). 모르는 `LLM_PROVIDER` 는 설정 오류다(TS 는 조용히 anthropic 으로 갔다).
- **기본 공급자의 설정만 필수.** 기본이 `anthropic` 이면 `ANTHROPIC_API_KEY`, `ollama` 면 `LLM_MODEL` 이 없을 때 기동하지 않고 이유(이름만)를 찍는다. `OLLAMA_BASE_URL` 은 기본 `http://127.0.0.1:11434`, `ANTHROPIC_BASE_URL` 은 기본 `https://api.anthropic.com` 이다. 검사는 `Config::from_env` 가 하고, 모델을 쓰지 않는 라우터 테스트가 쓰는 `Config::from_lookup` 은 값의 형식만 본다.
- **Ollama 의 생각은 기본으로 끈다.** 요청에 `think` 를 늘 싣고 기본은 `false`, `OLLAMA_THINK=true` 로 켠다. 빈 답은 성공으로 넘기지 않고 오류로 올린다.
- **사용량은 메모리 싱크.** 호출마다 공급자, 모델, 토큰, 비용, 시각을 `UsageRecord` 로 메모리에 적고 디버그 로그를 남긴다(본문 없음). 단가표는 TS 의 세 줄을 옮기고 모르는 모델과 Ollama 는 0이다. DB 에 적는 것(#4 의 설계)은 하지 않는다.
- **라이브 전용은 그대로.** 가짜 모델로 조용히 도는 모드는 없다. 발화 생성의 실패는 오류로 올린다.
- **위기 판정은 `safety` 가 모델을 trait 로 받는다.** `safety::assess_risk(text, model)` 이 키워드가 걸리면 바로 위기, 아니면 TS 의 `risk.prompt.ts` 그대로 모델에 YES/NO 를 묻고(상한 5토큰, 답이 `YES` 로 시작하면 위기), 모델이 실패하면 경고를 남기고 키워드 결과로 대신한다(ADR-0004). 이로써 기능 사이에 `safety → llm` 방향이 새로 생긴다(`TextModel` trait 와 요청 타입만 쓴다).

이 글은 ADR-0010 의 "한 모델은 Claude Haiku 4.5"와 "키 없이는 기동하지 않는다"를 대신한다. 한 관문, 키는 서버에만, 라이브 전용은 ADR-0010 대로다.

## 버린 것

| 안 | 이유 |
|---|---|
| Anthropic 만 옮기고 키 필수(그대로 포팅) | 사용자의 목표가 이 머신의 Ollama 이고, #3 을 TS 로 다시 할 이유가 없다 |
| 두 공급자의 설정을 모두 요구 | Ollama 로 돌릴 때 쓰지 않는 Anthropic 키를 요구하게 된다 |
| 모르는 `LLM_PROVIDER` 를 anthropic 으로 대신(TS) | 오타가 조용히 다른 공급자로 간다. 기동 때 막는 편이 낫다 |
| 사용량을 DB 테이블에 적기 | 운영 화면이 아직 없다. 필요해질 때 따로 다룬다(#4) |
| Ollama 의 생각을 기본으로 켜기 | 2026-10-16 실측에서 답이 비었다 |

## 결과

- `apps/server/.env.example` 에 `ANTHROPIC_BASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_THINK` 가 더해졌다. 이름은 Anthropic SDK 와 #3 이 쓰던 것이다.
- `apps/server/CLAUDE.md` 의 기능 사이 방향 목록에 `safety → llm` 을 더해야 한다.
- 모델을 바꿀 때 먼저 잴 것(ADR-0010 의 결과)은 그대로다. 특히 위기 판정 프롬프트가 Ollama 모델에서 같은 답을 내는지는 대화 PRD 에서 실제 모델로 확인한다.

## 근거

- `apps/server/src/llm/`(공급자, 라우터, 단가, 사용량, 설정), `apps/server/src/safety/risk.rs`, `apps/server/src/shared/config.rs`.
- TS 원본: `apps/api/src/llm/infrastructure/model-router.ts`, `apps/api/src/llm/domain/model/model-pricing.ts`, `apps/api/src/support/infrastructure/llm/reply-composer.adapter.ts`, `apps/api/src/support/infrastructure/llm/prompt/risk.prompt.ts`.
- 이슈 #9 의 "방식" 표, 이슈 #3 의 "설계"(gemma4 생각 켜기 실측, 2026-10-16).
