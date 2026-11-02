---
name: prod-query
description: "production(AWS EC2)의 DB 를 SSM 으로 읽기 전용 조회한다. 행 수, 상태, 시각, id 만 본다. Trigger: \"실서버 확인해\", \"production DB 봐 줘\", \"가입 신청 온 거 있어?\", \"승인 대기 계정\", 실제 사용자의 수나 상태를 물을 때. sandbox 나 로컬 확인은 ops-triage."
---

# prod-query: production DB 읽기 전용 조회

실제 사용자의 데이터는 AWS EC2 의 production DB 에만 있다. 로컬(`pnpm prod:up`, sandbox)에는 실제 신청이 들어오지 않는다. 그래서 "가입 신청 왔어?" 같은 질문은 이 스킬로 production 을 본다. sandbox 와 로컬 확인, API 호출은 `.claude/skills/ops-triage/SKILL.md` 다.

## 권한

auto 모드 분류기는 production 읽기를 막는다. 이 스킬의 명령은 프로젝트 `.claude/settings.json` 의 다음 allow 규칙으로 돈다(사용자 지시로 2026-10-28 에 넣었다). 규칙을 넓히지 않는다.

```json
"Bash(pnpm prod:query *)"
```

규칙이 없어 막히면 우회하지 않는다. 다른 명령(`aws ssm send-command` 직접 호출, 테스트를 가장한 실행)으로 같은 조회를 하지 않고, 아래 명령을 사용자에게 주어 `!` 로 돌리게 한다.

## 명령

```bash
pnpm prod:query "<SELECT 문>"      # 여러 문은 ; 로 잇는다
```

`infra/scripts/prod-query.sh` 가 다음을 한다.

1. 보내기 전에 SQL 을 거른다. `select` 나 `with` 로 시작하지 않는 문, 쓰기 낱말, psql 의 역슬래시 명령, 주석, `select *`, 본문 칸 이름이 있으면 보내지 않고 2 로 끝난다.
2. pulumi 스택 출력에서 인스턴스와 리전을 읽고, `old-admin` 프로필로 SSM Run Command 를 보낸다.
3. 호스트에서 compose 라벨로 db 컨테이너를 찾아, 읽기 전용 트랜잭션과 문당 10초 제한으로 psql 을 돈다.
4. 상태, 표준 출력, 오류 출력을 보여 준다. 성공이 아니면 1 로 끝난다.

## 지키는 선

- **본문은 보지 않는다.** 루트 `CLAUDE.md` "읽지 않는 것" 그대로다. 막는 칸은 `messages.text`, `memory_notes.text`, `pets.name`, `sessions.grief_profile`·`report`·`summary`·`history`, `turn_analyses.supervision`, `accounts.username`·`password_hash` 다. 계정 이름이 이메일일 수 있어 `username` 도 막는다. 계정은 `id`, `role`, `status`, `company`, 시각으로 가리킨다.
- 본문 칸을 더하는 마이그레이션은 `infra/docker/scripts/sandbox-scrub.sql` 과 함께 스크립트의 막는 목록에도 칸을 더한다.
- **쓰지 않는다.** 승인, 상태 바꾸기, 지우기는 이 스킬로 하지 않는다. 계정 승인은 운영 화면이나 관리자 API 로 사용자가 한다.
- 결과를 사용자에게 보일 때도 수와 상태, 시각만 싣는다.

## 자주 쓰는 조회

```bash
# 승인 대기 계정
pnpm prod:query "select status, count(*) from accounts group by status; select id, role, created_at from accounts where status = 'pending' order by created_at"

# 최근 7일 가입과 로그인
pnpm prod:query "select date_trunc('day', created_at) as day, count(*) from accounts where created_at > now() - interval '7 days' group by 1 order by 1"
pnpm prod:query "select count(*) from accounts where last_login_at > now() - interval '7 days'"

# 대화 활동(행 수만)
pnpm prod:query "select date_trunc('day', at) as day, count(*) from messages where at > now() - interval '7 days' group by 1 order by 1"
```

칸 이름은 `apps/server/migrations/` 에서 확인한다. production 은 배포한 커밋의 마이그레이션까지만 있어 main 보다 칸이 적을 수 있다(2026-10-28 에 `accounts.deleted_at` 이 없었다). "column does not exist" 가 나오면 그 칸을 빼고 다시 조회한다. `::text` 같은 형 변환은 막는 낱말에 걸리므로 `::varchar` 를 쓴다.

## 결과가 비었을 때

- 상태가 `Success` 인데 출력이 없으면 조회가 표를 내지 않은 것이다. 표가 0행이면 psql 이 `(0 rows)` 를 찍는다.
- 오류 출력에 "db 컨테이너를 찾지 못했다"가 나오면 호스트의 compose 프로젝트 이름이 바뀐 것이다. 함께 찍힌 컨테이너 이름으로 스크립트의 라벨을 고친다.
- 기다림이 모자라면 `MAX_WAIT_SECONDS=120 pnpm prod:query "..."` 로 늘린다.
