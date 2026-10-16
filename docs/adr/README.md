# 결정 기록 (ADR) 과 개발 일지

`docs/adr/` 는 제품과 구조의 결정을, `docs/devlog/` 는 해 봤는데 안 됐거나 뜻밖이었던 일을 적는다. 둘 다 추적되는 마크다운이 정본이고, `docs/docs.db` 는 거기서 만든 검색 색인이다(gitignore, `pnpm docs:index` 가 다시 만든다).

이슈(PRD)는 무엇을 만들지, 원장은 끝났는지를 적는다. 여기는 **왜 그렇게 정했는지**와 **무엇을 버렸는지**를 적는다. 둘 중 어디에도 없던 자리다.

## 언제 쓰는가

- ADR: PRD 로 정리되지 않는 결정이 내려질 때. 외부 서비스와 라이선스, 데이터를 두는 곳, 구조의 경계, 지키는 선. 같은 결정을 뒤집으면 새 ADR 을 쓰고 옛 것을 `superseded` 로 바꾼다. 옛 글은 고치지 않는다.
- 개발 일지: 실측이나 시도가 예상과 다르게 끝났을 때. 다음 사람이 같은 길을 다시 가지 않게 하는 것이 목적이다.

## 언제 읽는가

매번 읽지 않는다. PRD 를 쓰기 전과 제품 결정이 갈릴 때 `pnpm docs:search "<낱말>"` 로 찾고, 나온 것만 읽는다. 도구가 없으면 `grep -ril <낱말> docs/adr docs/devlog`.

## 형식

파일 이름은 `NNNN-kebab-제목.md`(ADR), `YYYY-MM-DD-kebab-제목.md`(일지). 머리말은 색인이 읽는다.

```markdown
---
id: ADR-0001              # 일지는 DEV-YYYY-MM-DD-kebab
date: 2026-10-14
status: accepted          # proposed | accepted | superseded | deprecated (일지는 생략)
tags: [payments, api]
related: [DEV-2026-10-13-payment-sdk-trial]   # 다른 글의 id
---
# 제목

## 맥락
## 결정 (일지는 "해 본 것")
## 버린 것 (일지는 "결과")
## 결과
## 근거
```

이 디렉터리는 GitHub 에 올라가고 고객이 볼 수 있다. `.env` 의 값과 실제 고객 데이터는 쓰지 않고, 그런 것이 걸린 실측은 `outputs/` 의 경로만 가리킨다.
