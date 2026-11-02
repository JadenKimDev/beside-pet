---
name: ops-triage
description: "떠 있는 로컬 Beside Pet 을 화면 없이 API 와 sandbox DB 로 직접 확인한다. QA 계정 로그인, 임시 계정 만들기와 승인, 세션·스트림·리포트 호출, DB 상태 조회와 상태 맞추기, 보고서 남기기. Trigger: \"API 로 확인해\", \"DB 봐 줘\", \"한 사이클 돌려\", \"ops triage\", 화면 로그인이 막혔을 때, 배포 전 마지막 점검."
---

# ops triage: API 와 DB 로 직접 확인하기

떠 있는 로컬 제품(API `http://localhost:3000`, 웹 `http://localhost:3001`)을 화면 없이 확인할 때 따른다. 팀장과 qa, developer 팀원 모두에게 해당한다. 서버와 웹은 다시 띄우지 않는다(띄우는 법은 루트 `CLAUDE.md` "명령").

## 권한

auto 모드 분류기는 자격 증명 파일 읽기와 DB 명령을 막는다. 이 스킬의 명령이 묻지 않고 돌려면 프로젝트 `.claude/settings.json` 에 아래 allow 규칙이 있어야 한다. 규칙이 없으면 먼저 사용자에게 추가를 요청하고, 그동안 "권한 없이 되는 것"(아래)만 한다.

```json
{
  "permissions": {
    "allow": [
      "Bash(curl -s* http://localhost:3000/*)",
      "Bash(curl -s* -b * http://localhost:3000/*)",
      "Bash(jq * data/qa/account.json*)",
      "Bash(docker exec beside-sandbox-db-1 psql -U beside -d besidepet *)",
      "Bash(docker compose -f infra/docker/compose.yaml -p beside-sandbox ps*)"
    ]
  }
}
```

규칙이 있어도 지키는 선은 같다.

- 비밀번호는 **터미널에 찍지 않는다.** `jq` 의 결과는 바로 `curl -d @-` 로 넘기거나 파일로만 보낸다. `cat data/qa/account.json`, `jq . data/qa/account.json` 처럼 통째로 보는 명령은 쓰지 않는다.
- `.env` 의 값은 읽지 않는다. DB 접속값은 `infra/docker/compose.yaml` 에 있는 고정값(`beside`/`beside`/`besidepet`, sandbox 컨테이너 `beside-sandbox-db-1`)만 쓴다.
- DB 에서는 **행 수와 상태 칸만** 본다. `sessions.history`, `sessions.report`, `sessions.summary`, `messages` 의 본문, `accounts.password_hash` 는 `SELECT` 하지 않는다(루트 `CLAUDE.md` "읽지 않는 것"). 대화 내용이 필요하면 QA 계정의 세션을 API(`GET /v1/sessions/{id}/messages`)로 읽어 보고서에 싣는다. QA 계정의 대화는 지어낸 것이라 보고서에 그대로 실어도 된다.
- sandbox DB 밖의 어떤 DB 에도 붙지 않는다. 이 머신의 production DB(`beside-production-db-1`, 5434)에는 이 스킬로 붙지 않는다. AWS 의 실서버 조회는 `.claude/skills/prod-query/SKILL.md` 다.

## 권한 없이 되는 것

- `POST /v1/auth/register` 로 지어낸 계정 가입(201, `status: pending`).
- 그 계정의 비밀번호는 내가 지어낸 값이므로 파일로 두고 `curl -d @파일` 로 로그인해도 된다.
- 승인만 관리자 권한이 필요하다. 관리자 비밀번호를 쓸 수 없으면 sandbox DB 에서 `update accounts set status='active' where username='<계정>' and status='pending'` 로 한다(DB 규칙이 허용될 때). 둘 다 막히면 멈추고 사용자에게 권한 추가를 요청한다.

## 작업 폴더

임시 파일(쿠키, 요청 본문, 응답)은 세션의 scratchpad 에 둔다. 레포 안에 쿠키 파일을 만들지 않는다. 보고서와 근거만 `outputs/qa/<이슈 또는 날짜-주제>/` 에 둔다.

## 절차

### 1. 떠 있는지

```bash
curl -s -w ' %{http_code}\n' http://localhost:3000/v1/health     # {"status":"ok"} 200
curl -s -o /dev/null -w 'web %{http_code}\n' http://localhost:3001/
docker compose -f infra/docker/compose.yaml -p beside-sandbox ps db            # healthy, 127.0.0.1:5433->5432
```

떠 있는 코드가 확인할 커밋인지는 `git log -1 --format=%h` 와 사용자가 준 sha 를 맞춰 본다.

### 2. 로그인

QA 계정(`data/qa/account.json`, 구조는 파일을 열지 말고 `jq 'paths|join(".")'` 로 경로만 본다)으로 로그인해 쿠키를 파일에만 둔다.

```bash
S=<scratchpad>
jq -c '<관리자 경로> | {username, password}' data/qa/account.json \
  | curl -s -o $S/login.json -w 'login %{http_code}\n' -c $S/admin.cookies \
    -H 'content-type: application/json' -d @- http://localhost:3000/v1/auth/login
jq -c '{username, role, status}' $S/login.json
```

실측용 계정이 따로 필요하면 관리자 쿠키로 `POST /v1/admin/accounts` (`username`, `password`(8자 이상), `company`, `role: viewer`) 로 만든다. 계정 이름은 `qa-<주제>-<월일>` 처럼 지어낸 값으로 하고, 보고서 "준비"에 적는다. 관리자 없이 만드는 길은 "권한 없이 되는 것".

### 3. 대화 한 사이클

세션 ID 는 클라이언트가 정한다(`sessionId`). 요청 필드와 허용값은 `apps/server/src/support/request.rs`.

```bash
SID="qa-<주제>-$(date +%s)"
printf '{"sessionId":"%s","griefProfile":{"griefPath":"afterLoss","petName":"콩이","togetherRange":"8-11","lossType":"illness","weeksSinceLoss":3,"preferredLanguage":"ko"}}' $SID > $S/start.json
curl -sN -b $S/qa.cookies -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -d @$S/start.json -D $S/t0.hdr http://localhost:3000/v1/sessions/stream \
  | while IFS= read -r l; do printf '%s %s\n' "$(date +%s.%N)" "$l"; done > $S/t0.sse
```

- 스트리밍 판정: 헤더가 `text/event-stream` 이고, `data:` 줄의 도착 시각이 퍼져 있으면(첫 청크와 마지막 청크 사이가 응답 전체 길이에 가깝고, 청크가 수십 개) 통과다. 한 번에 몰려오면 실패다. 청크의 모양은 `{kind:"text"}` 여럿, 마지막에 `{kind:"result"}` 와 `{progress, task, supportLevel, done}` 하나.
- 턴은 `POST /v1/sessions/{id}/messages/stream` 에 `{"text": "..."}`. 실제 모델 호출이므로 항목이 요구하는 만큼만(보통 3턴) 보낸다.
- 비스트림은 `POST /v1/sessions` 와 `POST /v1/sessions/{id}/messages`.

### 4. 목록, 다시 보기, 닫기, 리포트

```bash
curl -s -b $S/qa.cookies http://localhost:3000/v1/sessions | jq -c .
curl -s -b $S/qa.cookies http://localhost:3000/v1/sessions/$SID | jq -c 'del(.history,.summary,.report,.plan)'
curl -s -b $S/qa.cookies http://localhost:3000/v1/sessions/$SID/messages | jq -r '.[] | "\(.role): \(.text)"'
curl -s -o /dev/null -w 'report-before-close %{http_code}\n' -b $S/qa.cookies http://localhost:3000/v1/sessions/$SID/report   # 409 가 정상
curl -s -b $S/qa.cookies -X POST http://localhost:3000/v1/sessions/$SID/close | jq -c '{closed, reportAvailable}'
curl -s -b $S/qa.cookies http://localhost:3000/v1/sessions/$SID/report | jq .
curl -s -b $S/qa.cookies http://localhost:3000/v1/sessions/$SID/analysis | jq -c 'keys'
```

기대: 목록에 새 세션이 있고 `reportAvailable` 이 닫기 전 false, 닫은 뒤 true. 닫기 전 리포트는 409. 닫힌 세션에 메시지를 보내면 409.

### 5. DB 로 상태 보기와 맞추기

```bash
PSQL="docker exec beside-sandbox-db-1 psql -U beside -d besidepet -Atc"
$PSQL "select status, role, count(*) from accounts group by 1,2 order by 1,2"
$PSQL "select closed, count(*) from sessions where owner_id=(select id from accounts where username='<계정>') group by 1"
$PSQL "select count(*) from messages where session_id='$SID'"
```

상태를 비울 때는 `.claude/agents/qa.md` 의 방법(`TRUNCATE turn_analyses, messages, sessions, accounts`, 그 뒤 서버 재시작)을 따르고, 이것은 파괴적 변경이므로 사용자 승인 뒤에만 한다. 특정 계정의 세션만 지울 때는 `DELETE /v1/sessions/{id}` API 를 먼저 쓴다.

### 6. 보고서

`.claude/agents/qa.md` "보고서" 형식 그대로 `outputs/qa/<이슈 또는 날짜-주제>/report.html` 에 남긴다. 읽는 사람이 흐름을 따라갈 수 있게 **실제로 주고받은 대화와 리포트 본문을 그대로 싣는다**(QA 계정의 지어낸 대화만). 화면 대신 API 로 확인한 항목은 결과에 "(API 기준)" 을 붙이고, 화면에서만 알 수 있는 것(글자가 점진적으로 그려지는지, 레이아웃)은 미확인으로 적는다. 만든 계정과 세션, 되돌리지 않은 상태를 "준비"와 "눈에 띈 것"에 적는다. 끝나면 `open outputs/qa/<폴더>/report.html` 로 사용자의 브라우저에 띄운다.

## 엔드포인트 요약

경로는 `apps/server/src/*/api.rs` 의 `route(` 가 정본이다. 요청 필드는 `identity/api/request.rs`, `support/request.rs`.

| 일 | 호출 |
|---|---|
| 가입(승인 대기) | `POST /v1/auth/register` `{username, password, company}` |
| 로그인, 로그아웃, 본인 | `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me` |
| 관리자: 계정 목록, 만들기, 승인 | `GET/POST /v1/admin/accounts`, `POST /v1/admin/accounts/{id}/approve` (revoke, soft-delete, reactivate, expiry, DELETE 도 있음) |
| 세션 시작 | `POST /v1/sessions`, `POST /v1/sessions/stream` |
| 턴 | `POST /v1/sessions/{id}/messages`, `.../messages/stream` |
| 목록, 상태, 이력 | `GET /v1/sessions`, `GET /v1/sessions/{id}`, `GET /v1/sessions/{id}/messages` |
| 닫기, 리포트, 분석, 삭제 | `POST .../close`, `GET .../report`, `GET .../analysis`, `DELETE /v1/sessions/{id}` |
| 위기 안내 자료 | `GET /v1/safety/resources` |
