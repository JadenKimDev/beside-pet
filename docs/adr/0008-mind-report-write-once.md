---
id: ADR-0008
date: 2026-10-16
status: accepted
tags: [report, performance, llm, persistence]
related: [ADR-0005, ADR-0006]
---
# 마음 리포트는 처음 요청할 때 한 번 만들어 세션에 저장하고, 다시 만들지 않는다

## 맥락

세션이 끝나면 사용자에게 지난 대화를 돌아보는 "마음 리포트"(네 장: 여정, 감정, 간직할 것, 격려)를 보여 준다. 본문은 모델이 전사를 읽고 쓴다. 리포트를 열 때마다 모델을 다시 부르던 경로가 있었고, 그 응답이 4.6초 걸렸다. 같은 리포트가 열 때마다 달라지는 것도 문제였다. 모바일 시기에는 서버가 pdfkit 으로 PDF 를 만들어 Storage 에 올리고 서명 URL 을 주었는데, URL 만료와 저장 비용 때문에 "서버는 JSON 만, PDF 는 앱에서"로 바꾸기로 했다가 중단과 함께 남았다.

## 결정

- 리포트는 세션이 닫혔고 최소 한 단계를 마쳤을 때(`task >= REPORT_MIN_TASK`, 곧 2)만 열린다. 그 전에는 409 를 준다.
- 처음 요청 때 한 번 만들고 `sessions.report`(JSONB)에 저장한다. 다음 요청부터는 저장한 것을 돌려준다. 리포트는 write-once 다.
- 리포트에 대한 사용자 피드백은 그 리포트를 고치는 데 쓰지 않는다. 다음 세션의 리포트를 더 낫게 쓰는 재료로만 쓴다(로드맵).
- 리포트는 사용자용 표면이다. 내부 분석(종료 요약, 턴 분석)과 섞지 않는다.
- 웹 제품에는 PDF 내려받기가 없다. 필요해지면 모바일 시기의 결론대로 서버는 JSON 만 주고 클라이언트가 파일을 만드는 쪽을 먼저 본다.

## 버린 것

| 안 | 이유 |
|---|---|
| 열 때마다 생성 | 4.6초를 기다리고, 열 때마다 내용이 바뀌며, 호출 비용이 든다 |
| 세션 종료 때 미리 생성 | 리포트를 열지 않는 세션에도 비용을 쓰고 종료 응답이 느려진다(원 문서에 이유가 없어 코드에서 읽은 추정) |
| 서버에서 PDF 생성과 저장(모바일 시기) | Storage 비용과 서명 URL 만료 문제가 있었다 |
| 피드백을 받으면 리포트를 다시 씀 | 사용자가 본 기록이 바뀐다. 신호도 드물다 |

## 결과

- 리포트 조회는 4.6초에서 0.015초로 줄었다(포트폴리오 사례 문서의 측정. 측정 방법과 날짜는 원 문서에 남아 있지 않다).
- 첫 요청만 느리다. 첫 요청이 동시에 두 번 오면 두 번 만들 수 있다. 지금은 받아들인다.
- 대화를 지우면 리포트도 같이 지워진다(ADR-0006).
- 프롬프트나 모델을 바꿔도 이미 만든 리포트는 그대로다. 다시 만들고 싶으면 별도 PRD 로 다룬다.

## 근거

- `apps/api/src/support/application/support.query.ts` 의 `report`(저장된 것이 있으면 반환, 없으면 생성 뒤 저장), `apps/api/src/support/domain/model/mind-report.ts`(`REPORT_MIN_TASK`, 네 섹션 키).
- `apps/api/src/infrastructure/database/migrations/1730000000000-initial-schema.ts` 머리 주석 "write-once mind report (generated on first request)".
- `apps/api/README.md` 로드맵의 "리포트는 write-once" 문단.
- 포트폴리오 사례 문서(관리 레포의 `portfolio/case-studies/beside-pet.md`): "리포트를 매번 다시 만들던 경로를 없애 응답을 4.6초에서 0.015초로 줄였다".
- 모바일 시기: `docs/research/legacy/PROJECT_PAUSE_2026-03-26.md` 4절 TASK-001.
