---
id: ADR-0006
date: 2026-10-16
status: superseded
tags: [privacy, data, deletion, security]
related: [ADR-0034, ADR-0007, ADR-0008, ADR-0012]
---
# 대화 기록은 본인만 읽고, 대화를 지우면 전사와 리포트와 턴 분석을 한꺼번에 지운다. 계정 삭제의 연쇄는 아직 없다

> 2026-10-22 기준 `superseded`. 삭제는 소프트 삭제와 3개월 보관함, 기동 때 파기로 바뀌었고 계정 연쇄도 채워졌다(ADR-0036). 옛 선과 비어 있던 곳의 기록으로 남긴다.

## 맥락

이 제품이 저장하는 것은 사람이 슬픔에 대해 쓴 글이다. 옛 웹 API 의 문서는 "상담 기록이 제품의 실체"라고 적었다. 모바일 시기의 개인정보 가이드는 동의를 필수와 선택으로 나누고, 대화 원문의 보존 기간을 정하지 못한 채(제안: 90일 뒤 자동 삭제) 계정 삭제의 연쇄 삭제를 "구현 필요"로 남겼다. 웹 제품은 그중 일부만 코드로 만들었다. 이 글은 지금 지키는 선과 비어 있는 곳을 같이 적는다.

## 결정

- **저장하는 것.** 계정(`accounts`: 아이디, 비밀번호 해시, 소속, 역할, 상태, 만료, 대화 언어), 세션(`sessions`: 진행 상태 칸과 JSONB 의 애도 프로필, 전사, 지지 계획, 종료 요약, 마음 리포트), 턴 분석(`turn_analyses`: 위험 수준, 단계, 전이 여부 같은 집계용 칸). 실명과 이메일 칸은 없다.
- **본인만 접근한다.** 세션을 읽고 쓰는 모든 경로가 `assertOwner` 를 거친다. 소유자가 아니면 403 이다. 다만 지금 코드는 관리자에게 모든 세션을 열어 준다.
- **대화 삭제는 연쇄다.** 사용자가 대화 하나를 지우면 한 트랜잭션에서 그 세션의 턴 분석과 세션 행(전사, 리포트, 요약 포함)을 지운다. 잊혀질 권리를 대화 단위로 지킨다.
- **모델 키와 대화 내용은 서버에만 있다.** 웹은 API 키를 갖지 않는다. 서버는 대화 본문, 리포트 본문, 이메일을 로그와 오류 문구에 싣지 않는다.
- **개발 데이터는 지어낸 값이다.** 실제 사용자의 대화, 반려동물 정보, 계정을 개발 DB 와 픽스처에 넣지 않는다.
- **학습에 쓰지 않는다.** 모바일 시기 가이드의 핵심 문구 "We never use your messages to train AI models" 를 이어받는다. 서비스 개선 분석은 동의한 사람의 집계 통계로만 한다.

## 버린 것

| 안 | 이유 |
|---|---|
| 관리자가 평시에 전사를 열람 | 로드맵은 평시 열람을 막고 위기 때만 감사 로그를 남기며 여는 break-glass 를 두기로 했다. 아직 코드에 없어서 지금은 관리자 열람이 열려 있다. 이 글의 목표 상태는 break-glass 다 |
| 탈퇴 시 soft delete 뒤 30일 후 hard delete(모바일 시기 안) | 웹 계정은 관리자가 정지(soft)하거나 지우는(hard) 두 길만 있다. 30일 유예와 다운로드 링크는 만들지 않았다 |
| 피드백을 `turn_analyses` 에 칸으로 추가 | 로드맵은 별도 `feedback` 테이블을 두고 대화 삭제 때 같이 지우기로 했다. 사용자가 쓴 이유는 전사와 같은 규칙으로 다룬다 |

## 결과

- **비어 있는 곳 하나: 계정 삭제가 대화를 지우지 않는다.** 관리자의 hard delete 는 `accounts` 행만 지우고, `sessions.owner_id` 에 외래 키도 `ON DELETE CASCADE` 도 없다. 포트폴리오 사례 문서는 "탈퇴하면 연쇄 삭제한다"고 적었지만 이 레포의 코드와 맞지 않는다. 옛 README 로드맵도 "계정 삭제 시 대화 연쇄 삭제"를 Phase 2 로 두었다. 다시 운영하기 전에 고친다.
- 대화 원문의 보존 기간은 정하지 않았다. 정하면 이 글을 대신하는 새 ADR 을 쓴다.
- 옛 운영 RDS 는 저장 암호화가 꺼져 있었다. 모바일 시기 문서가 약속한 "저장 시 AES-256"은 웹 운영에서 지켜지지 않았다. 다시 올릴 때는 `infra/` 에서 켠다.
- Rust 포팅은 삭제 트랜잭션의 순서와 소유자 검사를 그대로 옮긴다.
- 대화 삭제의 연쇄에 기억 행(`memory_notes`, `memory_optouts`, 그 세션이 출처인 `pets`)을 더하고 기억의 보존 기간(12개월)을 정한 것은 ADR-0034 다(2026-10-22).

## 근거

- `apps/api/src/support/application/ownership.ts`(관리자 예외), `apps/api/src/support/application/delete-session.usecase.ts`, `apps/api/src/support/infrastructure/persistence/typeorm/postgres-session.repository.ts` 의 `delete`.
- `apps/api/src/identity/application/delete-account.usecase.ts`, `apps/api/src/identity/infrastructure/typeorm/postgres-account.repository.ts`(계정 행만 삭제), `apps/api/src/infrastructure/database/migrations/1730000000000-initial-schema.ts`(외래 키 없음).
- `apps/api/README.md` 로드맵의 "대화 삭제", break-glass, 피드백 테이블, "계정 삭제 시 대화 연쇄 삭제".
- `docs/research/2026-10-16-deploy-analysis.md`: RDS "암호화 안 됨".
- 모바일 시기: `docs/research/legacy/v3/development/데이터_수집_및_프라이버시_가이드.md`(수집 항목, 동의 구조, 보존 기간 TBD, 학습 미사용), `docs/research/legacy/2026-03-02-지시사항분석.md` 11절(CCPA 삭제권, cascade delete 구현 필요).
- 새 레포의 `CLAUDE.md` "지키는 선", "읽지 않는 것".
