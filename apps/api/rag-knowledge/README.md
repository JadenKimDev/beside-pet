# RAG 지식베이스 — 펫로스 애도

> 원칙: **"많이가 아니라 잘".** 검증된 애도 이론을 심리교육용으로 재서술한 소수 정예 코퍼스.

## 무엇이 들어있나

`grief-knowledge.json` — 약 20개 청크. 각 청크는 `{ source, task_id, tags[], content }`.

- **이론 기반**: Worden 애도의 4과제 · 이중과정모델(Stroebe & Schut) · 지속적 유대(Klass) · 박탈된 슬픔(Doka)
- **펫로스 특수**: 안락사 죄책감, 다른 반려동물의 애도, 아이와 함께하는 애도, 예기 애도(노령·말기)
- **안전**: 복합 비애 신호 + 위기 자원(한국 109 / 글로벌 ASPCA·대학 수의대 헬프라인)

`task_id` 로 Worden 과제(1~4)에 매핑되며, 과제 무관한 cross-cutting 지식은 `null`.

## ⚠️ 사용 시 주의 (정직하게)

- 이 내용은 **공개된 프레임워크 개념을 직접 풀어 쓴 것**이며, 저작권 있는 임상 교재의 원문이 아니다.
- **실제 서비스화 시**: ① 애도 전문가 검수 ② 정식 라이선스 출처 확보 ③ 위기 자원의 지역별·최신 검증 이 전제되어야 한다.
- 위기 자원 번호는 변경될 수 있으므로 배포 전 재확인 필수. (한국 자살예방상담 **109**, 정신건강 **1577-0199** — 2026년 기준)

## 더 권위 있는 출처 (확장용)

- **이론서**: Worden, *Grief Counseling and Grief Therapy* / Stroebe & Schut 의 Dual Process 논문 / Cordaro(2012) 펫로스 박탈된 슬픔 논문
- **기관**: ASPCA Pet Loss / Cornell·Tufts 수의대 Pet Loss 자료 / APLB(Association for Pet Loss and Bereavement) / APA 애도 자료

## 적재 (ingest)

```bash
npm run ingest   # scripts/ingest-knowledge.ts → 임베딩 후 pgvector(grief_knowledge) 적재
```

적재 후 `rag/retriever.ts` 가 현재 과제(task_id) + 사용자 입력으로 코사인 유사도 검색한다.
검색 결과는 트레이싱(Langfuse)으로 로깅해 "어떤 청크를 썼는지" 관찰 가능하게 한다.
