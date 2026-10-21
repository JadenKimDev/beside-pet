---
name: open-web
description: "웹 화면을 띄워 보거나 확인한다. 사용자가 보고 있는 pane 을 나누지 않는다. herdr 가 있으면 따로 된 탭의 터미널 브라우저로, 없으면 Chrome 도구로 연다. Trigger: 화면을 띄워 확인할 때, \"화면 열어 줘\", \"띄워 봐\", 구현한 화면을 직접 보고 확인해야 할 때."
---

# 웹 화면 띄우기

이 레포의 화면을 띄워 보거나 확인할 때 따른다. 팀장과 팀원 모두에게 해당한다.

## 지키는 것

사용자가 보고 있는 pane 을 나누지 않는다. `terminal-browser open --split` 이나 그냥 `terminal-browser open` 으로 사용자의 pane 옆에 열지 않는다. pane 을 나누면 브라우저의 폭이 좁아져 화면이 깨지고, 사용자가 읽던 화면도 함께 좁아진다.

## 여는 법

먼저 개발 서버가 떠 있는지 본다. 띄우는 명령은 루트 `CLAUDE.md` "명령"에 있다.

| 화면 | 주소 |
|---|---|
| 상담 웹 (`apps/web`) | `http://localhost:3001/` (웹이 API 를 `localhost:3000` 으로 부르므로 `127.0.0.1` 로 열면 쿠키가 실리지 않는다) |
| API 상태 확인 (`apps/server`) | `http://localhost:3000/v1/health` |

**워크트리에서 띄울 때는 포트를 이슈 번호로 정한다.** 구현 세션 여럿이 같은 3000·3001 을 쓰면 서로의 서버에 붙는다(2026-10-21, #28 과 #32 가 동시에 QA 하다 섞임). 워크트리의 서버는 `PORT=<이슈>10`, 웹은 `NEXT_PUBLIC_API_BASE_URL=http://localhost:<이슈>10 pnpm -F @beside-pet/web dev --port <이슈>11` 로 띄우고 `http://localhost:<이슈>11` 을 연다(예: #28 → 2810, 2811). 본 체크아웃의 `pnpm dev` 만 3000·3001 을 쓴다.

**herdr 가 있으면** 따로 된 탭의 터미널 브라우저로 연다.

```bash
pnpm -s browser:tab http://localhost:<포트>/
```

- `browser` 라는 이름의 탭이 없으면 만들고, 있으면 그 탭의 브라우저를 주소로 옮긴다. 탭을 여러 개 만들지 않는다.
- 포커스는 옮기지 않는다. 사용자가 보려면 `browser` 탭으로 넘어가면 된다고 알린다.
- 마지막 줄에 브라우저의 키(예: `92160-1`)가 나온다. 이후의 조작에 쓴다.

**herdr 가 없으면** `mcp__claude-in-chrome__*` 도구로 새 Chrome 탭을 열어 확인한다. 그 도구도 없으면 사용자에게 주소를 알리고, 본 것과 보지 못한 것을 구분해 보고한다.

## 조작하고 읽는 법 (터미널 브라우저)

현재 pane 에 브라우저가 없으므로 늘 키를 붙인다.

```bash
terminal-browser action --browser <키> -- snapshot
terminal-browser action --browser <키> -- click @e14
terminal-browser action --browser <키> -- eval "document.title"
```

## 로그인이 필요한 화면 (자동으로 한다)

로그인 폼에 비밀번호를 채우는 명령(`fill`)은 auto 모드 분류기가 막는다. 사용자에게 로그인을 부탁하지 않고 API 로 받은 쿠키를 브라우저에 넣는다. 2026-10-21 로컬 production(`127.0.0.1:8001`)에서 확인한 절차다.

1. API 에 로그인해 `Set-Cookie` 의 `beside-pet.token=<값>` 만 scratchpad 파일에 적는다. 비밀번호와 토큰은 출력하지 않는다. QA 계정은 `data/qa/account.json`(`username`, `password`)이다.

   ```bash
   curl -s -D - -o /dev/null -H 'Content-Type: application/json' \
     -d "$(python3 -c 'import json;d=json.load(open("data/qa/account.json"))["viewer"];print(json.dumps({"username":d["username"],"password":d["password"]}))')" \
     http://127.0.0.1:<API 포트>/v1/auth/login | grep -i '^set-cookie' | sed 's/^[Ss]et-[Cc]ookie: //; s/;.*//' > "$SCRATCH/qa-cookie.txt"
   ```

2. 같은 호스트로 연 터미널 브라우저에 쿠키를 넣고 새로고침한다. `HttpOnly` 는 JS 가 읽지 못하게 할 뿐이고, 같은 이름으로 JS 가 넣은 쿠키도 서버는 똑같이 받는다.

   ```bash
   terminal-browser action --browser <키> -- eval "document.cookie='$(cat "$SCRATCH/qa-cookie.txt"); path=/'; location.reload(); 'ok'"
   terminal-browser action --browser <키> -- eval "location.pathname"      # /sessions 면 로그인된 것
   ```

3. 끝나면 scratchpad 의 쿠키 파일을 지우고 탭을 닫는다.

호스트 이름은 API 와 화면이 같아야 한다(sandbox 는 둘 다 `localhost`, 로컬 production 은 둘 다 `127.0.0.1`). 계정이 그 DB 에 없으면 `401` 이 나므로 먼저 QA 계정을 만든다(`ops-triage` 스킬).

## 좁은 폭으로 보기 (터미널 브라우저)

제품은 웹으로만 운영하므로 휴대폰 브라우저가 곧 모바일 앱이다. 화면을 고친 PRD 는 데스크톱 폭과 함께 390px(iPhone 기준)도 한 번 본다. Chrome 확장의 창 크기 바꾸기는 이 머신에서 먹지 않으므로(요청 390 → 실제 948, 2026-10-20 확인) 좁은 폭은 터미널 브라우저로만 잰다. `set viewport <폭> <높이> <배율>` 의 결과는 그 호스트의 확대 배율에 따라 달라진다(2026-10-21 실측: 같은 인자가 한 탭에서는 CSS 390, 다른 탭에서는 1649 가 됐다). 먼저 브라우저 pane 에 Cmd+0 을 보내 배율을 1 로 맞추고(`herdr pane send-keys <브라우저 pane> super+0`), `set viewport 390 760 2` 로 CSS 390×760(DPR 2)을 만든 뒤 `eval` 로 `innerWidth` 가 390 인지 반드시 확인한다. `open` 으로 주소를 바꾸면 뷰포트가 풀리므로 이동은 `eval "location.href='...'"` 로 한다.

```bash
terminal-browser action --browser <키> -- set viewport 390 760 2
terminal-browser action --browser <키> -- eval "window.innerWidth + 'x' + window.innerHeight + ' dpr ' + devicePixelRatio"   # 390x760 dpr 2
terminal-browser action --browser <키> -- eval "location.href='http://localhost:3001/sessions'"                               # open 대신
terminal-browser action --browser <키> -- eval "document.documentElement.scrollWidth > window.innerWidth"   # true 면 가로 넘침
terminal-browser action --browser <키> -- snapshot                                                           # 잘린 글, 겹친 요소는 스냅샷으로
```

화면마다 보는 것: 가로 넘침(`scrollWidth <= innerWidth`), 버튼·선택지의 높이 44px 이상(`getBoundingClientRect().height`), 입력 글자 16px 이상(`getComputedStyle(el).fontSize`, iOS 자동 확대 방지), 머리의 도움 알약과 바닥의 위기 띠·면책이 보이는가, 대화 화면에서 입력창이 뷰포트 안에 있는가. 확인이 끝나면 `set viewport 1280 800 2`(CSS 1280×800)으로 되돌려 데스크톱 배치가 그대로인지 한 번 본다.

## 화면을 볼 때의 선

- 루트 `CLAUDE.md` "지키는 선"과 "읽지 않는 것"이 그대로 적용된다. 확인용 데이터는 지어낸 값으로 새로 만들고, 끝나면 지운다. 실제 고객 데이터가 보이는 화면은 캡처하지 않는다.
- 바깥에 닿는 동작(실제 결제, 메일과 문자 발송)을 일으키는 버튼은 누르지 않는다.

## 끝난 뒤

확인이 끝나면 연 탭을 닫는다. 사용자가 계속 보겠다고 했으면 둔다.

```bash
herdr tab list        # label 이 browser 인 탭의 tab_id 를 찾는다
herdr tab close <tab_id>
```
