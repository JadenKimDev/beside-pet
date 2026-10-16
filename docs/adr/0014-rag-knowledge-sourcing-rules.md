---
id: ADR-0014
date: 2026-10-16
status: accepted
tags: [rag, knowledge, content, licensing]
related: [ADR-0003, ADR-0004, ADR-0005]
---
# 지식 검색의 자료는 소수 정예로 두고, 공개 이론을 풀어 쓰거나 CC BY 오픈액세스 논문을 출처와 함께 재서술한 것만 쓴다

## 맥락

발화 생성 전에 현재 애도 과제에 맞는 지식 조각을 두 개까지 찾아 프롬프트에 넣는다. 이 조각이 모델의 말에 섞여 나가므로 내용의 정확성과 저작권이 제품의 책임이 된다. 임상 교재의 원문을 넣으면 저작권 문제가 생기고, 출처 없는 요약은 검수할 수 없다.

## 결정

- **많이가 아니라 잘.** 코퍼스는 20개 안팎의 조각이다. 각 조각은 출처, 과제 번호(1에서 4, 과제와 무관하면 비움), 태그, 내용으로 이루어진다.
- **공개 프레임워크는 직접 풀어 쓴다.** Worden 의 애도 네 과제, Stroebe 와 Schut 의 이중과정모델, 지속적 유대(Klass), 박탈된 슬픔(Doka) 같은 공개 개념을 우리 말로 다시 쓴다. 저작권 있는 임상 교재의 원문을 넣지 않는다.
- **논문은 CC BY 오픈액세스만.** 지금 쓰는 것은 Testoni et al.(2019, Animals, CC BY 4.0)과 Wu and Song(2025, Behavioral Sciences, CC BY)이다. 각 항목에 저자, 저널, DOI, 라이선스를 적고, 재서술과 함께 검증용 짧은 영어 원문 인용을 둔다. 원문을 통째로 옮기지 않는다.
- **한계를 함께 적는다.** 횡단 연구, 자기 보고, 표본 크기 같은 한계를 출처 옆에 적는다.
- **응급 처치와 수의학 정보는 넣지 않는다.** 그런 내용은 링크로만 보낸다(ADR-0012).
- **위기 번호는 지식이 아니라 고정 데이터다.** 위기 연락처는 지식 조각이 아니라 `safety-resources.ts` 한 곳에서 관리한다(ADR-0004).
- **실제로 공개하기 전에** 애도 전문가의 검수, 라이선스 버전의 원문 재확인(Wu and Song 은 CC BY 버전이 3.0 인지 4.0 인지 확인 필요), 위기 자원의 지역별 최신 확인을 거친다.

## 버린 것

| 안 | 이유 |
|---|---|
| 임상 교재와 책의 원문 발췌 | 저작권. 재서술로 대신한다 |
| 웹 검색 결과를 그때그때 넣기 | 검수할 수 없고 재현되지 않는다 |
| 큰 코퍼스와 임베딩 검색부터 | 지금 규모에서는 과제 번호와 태그로 충분하다. 포트 뒤에 있어 pgvector 로 바꿀 수 있다 |

## 결과

- 지금 검색 어댑터는 출처 없는 `grief-knowledge.json` 만 읽는다. 출처를 단 `grief-knowledge-sourced.json`(10조각)은 레포에 있지만 쓰이지 않는다. 이 결정에 맞추려면 두 파일을 합치거나 어댑터가 출처 있는 쪽도 읽게 한다.
- `rag-knowledge/README.md` 는 `npm run ingest` 로 pgvector 에 적재하고 Langfuse 로 쓴 조각을 기록한다고 적었지만, 그 스크립트와 연동은 없다. 실제 구현은 메모리의 JSON 이다.
- 위기 자원 설명에 한국 109 와 함께 ASPCA, 대학 수의대 헬프라인이 섞여 있다. 시장을 정하면(ADR-0002) 맞춘다.
- 모바일 시기의 학술 가이드(약 9만 자)는 저자와 연도로 인용했지만 라이선스 확인은 없었다. 그 내용을 지식 조각으로 옮길 때는 이 규칙을 다시 거친다.

## 근거

- `apps/api/rag-knowledge/README.md`, `apps/api/rag-knowledge/SOURCES.md`.
- `apps/api/src/support/infrastructure/knowledge/rag.adapter.ts`(읽는 파일), `apps/api/src/support/application/support.orchestrator.ts`(`KNOWLEDGE_LIMIT = 2`).
- `docs/research/legacy/v2/development/펫로스_상담_학술_기반_가이드.md`(인용 방식), `docs/research/legacy/v2/legal/약관_및_가이드라인.md` 6.5절(응급 처치는 링크로만).
