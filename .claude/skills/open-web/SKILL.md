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
| 상담 웹 (`apps/web`) | `http://127.0.0.1:3001/` |
| 소개 사이트 (`apps/landing`) | `http://127.0.0.1:3002/` |
| API 상태 확인 (`apps/api`) | `http://127.0.0.1:3000/v1/health` |

**herdr 가 있으면** 따로 된 탭의 터미널 브라우저로 연다.

```bash
pnpm -s browser:tab http://127.0.0.1:<포트>/
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

## 화면을 볼 때의 선

- 루트 `CLAUDE.md` "지키는 선"과 "읽지 않는 것"이 그대로 적용된다. 확인용 데이터는 지어낸 값으로 새로 만들고, 끝나면 지운다. 실제 고객 데이터가 보이는 화면은 캡처하지 않는다.
- 바깥에 닿는 동작(실제 결제, 메일과 문자 발송)을 일으키는 버튼은 누르지 않는다.

## 끝난 뒤

확인이 끝나면 연 탭을 닫는다. 사용자가 계속 보겠다고 했으면 둔다.

```bash
herdr tab list        # label 이 browser 인 탭의 tab_id 를 찾는다
herdr tab close <tab_id>
```
