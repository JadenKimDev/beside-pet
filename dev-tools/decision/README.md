# decision — 상투성 판정기의 라벨 데이터와 평가 하네스

동반자의 답이 누구에게나 통하는 위로인지(`generic_comfort`), 보호자가 말한 구체를 받았는지(`specific_reflection`),
질문인지(`question`), 위기 고정 문구인지(`crisis_fixed`, 평가에서 제외)를 고르는 판정기를 재는 개발 도구다(#26).

## 왜 이 디렉터리만 Python 인가

레포의 다른 도구는 TypeScript 지만, 여기서 다루는 판정기와 학습 도구(Laya, PEFT, torch, transformers)가
Python 에만 있다. 그래서 이 디렉터리만 uv(Python 3.12) 프로젝트로 두고, `pnpm decision:*` 스크립트가
`uv run` 으로 부른다. 제품 코드(`apps/`)는 이 디렉터리를 가져오지 않는다.

## 재료의 선

재료는 두 가지뿐이고 둘 다 지어낸 글이다. 실제 사용자 세션은 재료로 쓰지 않는다.

- `source: "chat-eval"`: `outputs/chat-eval/**/*.run.json`(QA 계정의 지어낸 인물 대화). 경로는
  `src/decision/paths.py` 에 고정돼 있고 `decision.label` 은 다른 경로를 받는 인자를 두지 않는다.
- `source: "synthetic-haiku"`: 전사가 모자라는 만큼 `decision.synth` 가 만든 답. 인물 파일
  (`dev-tools/chat-eval/personas/*.json`)의 지어낸 사용자 말과, 서버의 발화 지시문(`apps/server/src/support/prompt/reply.rs`
  를 읽어 뽑는다. 복사본을 두지 않는다)을 haiku(`claude -p`)에 넣는다. 인물의 맥락이 모자라면 같은 인물의 지어낸
  2턴 맥락을 haiku 에 먼저 받는다. 같은 맥락에 단계(Task, Deepen, Retry, Closing, 빈 맥락은 Intro)와 지시 변형
  (없음, 일반적인 위로만, 구체를 받아라, 질문을 주로)을 섞는다. 변형 지시는 줄에 남기지 않는다. 라벨은 라벨러가 붙인다.

`claude -p` 는 `src/decision/claude_cli.py` 한 곳에서 부른다(구독 세션, Anthropic API 클라이언트 없음). 결과는
`outputs/decision/cache/<해시>.json` 에 남아 다시 돌리면 재사용하고, 동시 실행은 4개까지다.

## 형식

한 줄 = `{"id", "persona", "source", "state": {"user_turns": [...], "reply": "..."}, "questions": {"kind": {"type": "choice", "instructions", "criteria", "label"}}}`.
Kev 의 학습 JSONL 과 같은 모양이고, Laya·Kev·systemone 은 모르는 칸(`persona`, `source`)을 무시한다. `instructions` 와
`criteria` 문자열은 `src/decision/schema.py` 한 곳에 두고 모든 줄에 같게 넣는다. 검증기는 줄의 문자열이 이
상수와 다르면 실패한다(라벨 정의를 고치면 후보를 다시 뽑는다).

- `id` 는 `<chat-eval 아래 상대 디렉터리>/<인물>#<턴>` 이다. 인사(greeting)는 `#0` 이고 `user_turns` 가 비었다.
  턴의 답은 `#<turns[i].index>` 이고 `user_turns` 는 직전 사용자 말 최대 2개(오래된 것부터)다.
- 합성 줄의 `id` 는 `synth/<인물>#<맥락·단계·변형의 해시 10자>` 다.
- 같은 답 본문은 한 번만 남긴다. chat-eval 줄이 먼저고(전사는 경로 순), 합성 줄이 뒤다.
- `decision:label` 은 chat-eval 줄만 다시 뽑고 후보 파일의 합성 줄은 남긴다. `decision:synth` 는 chat-eval 줄을 두고
  합성 줄을 다시 만든다(캐시가 있으면 같은 답이 나온다).

## 명령

```bash
pnpm decision:label                       # → data/candidates.jsonl (라벨 전 후보), 인물·출처별 줄 수를 출력
pnpm decision:synth --target 600          # 후보 파일이 600줄이 되도록 합성 줄을 채운다
pnpm decision:split                       # → data/split.json (인물 단위 학습/평가)
pnpm decision:label --agree data/labels/a.jsonl data/labels/b.jsonl
                                          # 일치율, Cohen's kappa, data/labels/disagreements.jsonl(id, state, a, b)
cd dev-tools/decision && uv run python -m decision.validate data/labels/a.jsonl          # 라벨 파일(label 필수, 기본)
cd dev-tools/decision && uv run python -m decision.validate --candidates data/candidates.jsonl  # 후보 파일
pnpm decision:eval --judge claude --model haiku   # 평가셋(final.jsonl 의 eval_personas)으로 재어 outputs/decision/<날짜>/report.md 에 행을 쌓는다
pnpm decision:eval --judge laya --model 2nugu/laya-ko
cd dev-tools/decision && uv run pytest -q
```

`claude` 판정기의 프롬프트는 `src/decision/judges/claude.py` 의 `SYSTEM_PROMPT` 와 `USER_PROMPT_TEMPLATE` 한 곳에 있고,
다음 PRD 의 서버 HaikuJudge 가 같은 문자열을 쓴다. 고치면 평가를 다시 돌리고 서버 쪽도 함께 고친다.

`--agree` 의 경로는 `dev-tools/decision` 기준이다(스크립트가 그 디렉터리로 들어가 돈다).

## 분할 규칙

인물(`persona`) 단위로 가른다. 같은 인물의 줄은 한쪽에만 들어간다. 평가에 chat-eval 출처가 30줄 이상 들어가는
인물의 부분집합 가운데, 출처마다 "평가에 든 줄 수"와 "그 출처 전체의 20%"의 거리를 더한 값이 가장 작은 것을
평가로 둔다. 그래서 두 출처가 함께 20% 에 가깝게 비례한다. 30줄을 채우는 조합이 없으면 이 조건 없이 고른다.
같은 거리의 조합이 여럿이면 시드(26)로 섞은 차례의 처음 것을 고른다. 모든 인물을 평가로 두지는 않는다. 인물이
16명을 넘으면 모든 조합을 보지 않고 시드로 섞은 차례대로 거리가 줄어들 때만 더한다.
