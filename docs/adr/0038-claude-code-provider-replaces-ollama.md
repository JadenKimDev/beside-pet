---
id: ADR-0038
date: 2026-10-23
status: accepted
tags: [llm, provider, claude-code, anthropic, rust, server, harness]
related: [ADR-0010, ADR-0016, ADR-0035]
---
# 모델 관문의 공급자는 Anthropic 과 Claude Code 둘이고, 개발·실측은 이 Mac 의 Claude Code 구독으로 Haiku 5.5 를 부른다

## 맥락

ADR-0016 은 공급자를 Anthropic 과 Ollama 둘로 두었다. 그 뒤 사용자는 개발과 실측(`pnpm chat:eval`, QA)에 API 키 대신 이 Mac 의 Claude Code 구독을 쓰기로 했고(2026-10-21), 그것을 `claude -p` 를 Ollama `/api/chat` 모양으로 감싸는 셈(`dev-tools/scripts/claude-shim.py`)과 `LLM_PROVIDER=ollama` 로 해 왔다. 그래서 로그와 `llm_calls` 에 `provider=ollama` 가 남고, 설정과 스킬이 "셈 경로 = ollama" 로 읽혔다. Ollama 모델(gemma4)로 바꾸려던 목표는 더 쓰지 않는다. 사용자는 2026-10-23 에 껍데기를 지우고 Claude Code 의 Haiku 5.5 를 바로 쓰라고 했다(이슈 #50).

`claude -p` 의 실측(2026-10-23, Claude Code 2.1.309, 등급 A, 이슈 #50 의 "조사"):

- `--input-format stream-json` 의 assistant 줄은 역할 턴이 아니라 사용자 글로 접히고, user 줄마다 턴이 하나씩 돈다. 역할 기록을 보내는 길이 아니다.
- `--session-id`/`--resume` 은 이전 턴을 기억하지만 전사가 `~/.claude/projects/` 에 파일로 남아 대화 본문이 서버 밖에 쌓인다.
- `--json-schema` 는 `structured_output` 에 스키마대로의 JSON 을 준다.
- `--output-format stream-json --include-partial-messages` 는 `content_block_delta` 조각을 실제로 흘린다.
- 하네스의 환경 블록(약 600 토큰)은 `--system-prompt` 를 줘도 붙고, `max_tokens` 를 넘길 옵션은 없다.

## 결정

- **공급자 둘: Anthropic 과 Claude Code.** `llm` 의 Ollama 공급자와 설정(`OLLAMA_BASE_URL`, `OLLAMA_THINK`)을 지우고 `claude-code` 공급자를 둔다. `LLM_PROVIDER` 는 `anthropic | claude-code` 이고 `ollama` 는 다른 모르는 값과 같이 설정 오류다. 등록은 Anthropic 은 키가 있을 때, Claude Code 는 늘. production 은 그대로 Anthropic API 이고 EC2 와 컨테이너에는 `claude` 가 없다.
- **`claude-code` 공급자는 호출마다 `claude -p` 를 자식 프로세스로 띄운다.** 인자는 `--model <모델> --tools "" --max-turns 1 --setting-sources "" --strict-mcp-config`, system 은 `--system-prompt`, 사용자 프롬프트는 stdin, 작업 디렉터리는 빈 임시 디렉터리(레포의 `CLAUDE.md` 와 메모리가 섞이지 않게). 자식 env 는 `MAX_THINKING_TOKENS=0`(Anthropic 경로의 `thinking: disabled` 와 같다)이고 `CLAUDECODE`, `CLAUDE_CODE_*` 는 넘기지 않는다(ADR-0035). 프롬프트와 답의 본문은 로그에 적지 않는다.
- **대화 기록은 `<conversation>` 글 하나로 편다.** 역할 메시지를 보내는 길이 없으므로 system 들은 이어 붙이고 턴들은 `<user>`/`<assistant>` 로 감싼 글 하나로 보낸다. 세션 resume 은 쓰지 않는다. 서버는 턴마다 시스템 프롬프트와 대화 창을 새로 짜고, 대화 본문을 서버 밖 파일에 남기지 않는다.
- **생성은 `--output-format json`, 스트림은 `stream-json`, 구조화 출력은 `--json-schema`.** 토큰은 `usage` 의 `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` 와 `output_tokens` 다. 출력 상한은 글자 수로 근사해 자른다(글자 6개를 토큰 하나로). 시간 제한은 라우터의 `CallLimits` 가 그대로 걸고 걸리면 자식을 죽인다. `is_error`, 0 아닌 종료, 빈 답은 한 번 다시 시도하고 그래도 실패하면 오류다.
- **기동 조건.** 기본이 `anthropic` 이면 `ANTHROPIC_API_KEY`, `claude-code` 면 요구하는 설정이 없다(`LLM_MODEL` 이 없으면 `claude-haiku-5-5`). `claude` 가 PATH 에 없는 것은 첫 호출의 오류로 드러난다(가짜 모드는 없다, ADR-0010).
- **비용은 0.** `model_prices` 에 `claude-code` 행을 두지 않고 단가 행이 없으면 비용 뷰는 0 이다(구독). `llm_calls.provider` 에는 `claude-code` 가 그대로 들어간다.
- **테스트는 가짜 실행 파일로.** 생성자에 실행 파일 경로를 넘겨, 받은 인자와 stdin 을 적고 미리 정한 json 또는 stream-json 을 찍는 스크립트로 검사한다. 실제 `claude` 를 부르는 테스트는 두지 않는다.

ADR-0016 의 "공급자는 Anthropic 과 Ollama" 를 이 글이 대신한다. ADR-0016 의 나머지(기본 공급자의 설정만 필수, 모르는 `LLM_PROVIDER` 는 오류, Anthropic 의 생각 끄기, 라이브 전용, 위기 판정이 모델을 trait 로 받음)는 이 글이 이어받는다. ADR-0010 의 한 관문, 키는 서버에만, 라이브 전용은 그대로다.

## 버린 것

| 안 | 이유 |
|---|---|
| 셈을 그대로 두고 `ollama` 공급자로 띄우기 | 로그와 `llm_calls` 가 거짓(`ollama`)을 적고, 설정과 스킬이 셈 경로를 Ollama 로 읽힌다. HTTP 한 홉과 가짜 스트림이 남는다 |
| Ollama 공급자를 남겨 두기 | 쓰는 곳이 없다. 설정 칸과 테스트 17개 파일이 죽은 길을 가리킨다 |
| `--session-id`/`--resume` 으로 역할 턴 유지 | 대화 본문이 `~/.claude/projects/` 에 남아 "읽지 않는 것" 의 경계를 넘고, 서버가 턴마다 새로 짜는 시스템 프롬프트와 어긋난다 |
| `--input-format stream-json` 으로 역할 메시지 보내기 | assistant 줄이 사용자 글로 접히고 user 줄마다 모델 호출이 돈다 |
| 가짜 실행 파일 대신 실제 `claude` 를 부르는 테스트 | 구독과 PATH 에 묶여 러너와 다른 머신에서 돌지 않는다 |

## 결과

- Anthropic 경로와 남는 차이: 하네스의 환경 블록이 시스템 프롬프트 뒤에 붙고(약 600 토큰), 역할 턴 대신 글 하나이고, 출력 상한이 근사이고, 프로세스 기동으로 지연이 몇 초 길다. 실측(`pnpm chat:eval`)의 수치를 production 과 맞댈 때 이 차이를 본다.
- `apps/server/.env.example` 에서 `OLLAMA_*` 가 빠지고 `LLM_MODEL` 예시는 `claude-haiku-5-5` 다. `dev-tools/scripts/claude-shim.py` 와 `llm:shim` 은 지웠다.
- production 의 모델을 5.5 로 올리는 것은 SSM 의 `server-env` 값이라 사용자가 한다.
- 루트 `CLAUDE.md` 의 "Ollama 모델로 바꿀 예정" 은 이 글로 고쳤다.

## 근거

- 이슈 #50 의 "지금 셈 경로와 production Anthropic 경로의 차이" 표와 "조사" 표(2026-10-23 실측).
- `apps/server/src/llm/provider/claude_code.rs`, `apps/server/src/shared/config.rs`.
- ADR-0035(운영 화면이 `claude -p` 를 구독으로 띄우는 방식과 자식 프로세스 env 규칙).
