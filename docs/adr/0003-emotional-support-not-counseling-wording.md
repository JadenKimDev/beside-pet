---
id: ADR-0003
date: 2026-03-09
status: accepted
tags: [wording, legal, content, tone]
related: [ADR-0004, ADR-0012]
---
# 사용자에게 보이는 글에서 이 제품은 "감정 지원"이다. 상담, 치료라고 부르지 않고, 면책 조항의 부정형만 예외다

## 맥락

펫로스를 다루는 AI 대화 제품은 쉽게 "AI 상담", "그리프 테라피"로 소개된다. 미국 기준으로 이것은 이름의 문제가 아니었다. counseling, therapy 라는 말은 면허 요건, FTC 의 표시 광고 심사, 배상 책임으로 이어질 수 있다고 판단했다. 모바일 시기에 이 판단을 워딩 정책 문서로 만들고 규칙 파일 맨 앞에 "필수"로 올렸다. 웹 제품의 문서도 같은 원칙을 "치료가 아니라 정서적 지지"로 이어받았다.

## 결정

- 제품은 보호자를 위한 감정 지원 동반자다. 상담 서비스, 치료 앱, 정신건강 치료 도구, 의료기기, 전문 돌봄의 대체가 아니다.
- 마케팅, 기능 이름, UI, 알림, 오류 문구, FAQ, 블로그, 스토어 문구에 다음 말을 쓰지 않는다. counseling, therapy, therapist, counselor, treatment, clinical, diagnose, cure, patient. 대신 emotional support, AI companion, grief support, comfort, conversation 또는 chat 을 쓴다.
- AI 는 "AI companion" 이다. "AI therapist", "AI counselor" 라고 부르지 않는다. 대화 단위는 "counseling session" 이 아니라 "conversation" 이다.
- 예외는 약관, 개인정보 처리방침, 면책 문구에서의 부정형뿐이다. "Beside Pet is not a substitute for professional therapy" 같은 문장은 쓰는 것이 오히려 필수다.
- 결과를 약속하지 않는다. "슬픔을 치유한다", "치료만큼 효과적", "임상적으로 입증" 같은 말을 쓰지 않는다. 가격 비교도 "치료보다 싸다"가 아니라 "기존 그리프 지원의 일부 비용"으로 쓴다.
- 위기 표현에서도 "AI 가 위기를 다룬다"고 말하지 않는다. "전문 자원으로 잇는다"고 말한다(ADR-0004).

## 버린 것

| 안 | 이유 |
|---|---|
| "AI 펫로스 상담"으로 소개 | 검색과 이해는 쉽지만 면허와 광고 규제의 위험을 산다 |
| 모든 문맥에서 금지어 전면 금지 | 면책 조항은 "치료가 아니다"를 분명히 말해야 해서 부정형은 남겼다 |
| 스토어 카테고리 Medical | Health & Fitness 또는 Lifestyle 로 두었다. 의료 앱으로 보일 이유를 만들지 않는다 |

## 결과

- 이 원칙은 웹에서도 그대로다. 웹의 고정 문구, 위기 안내, 마음 리포트의 제목에 이 금지어가 들어가지 않는지 리뷰 때 본다.
- 내부 문서와 코드 이름에는 아직 "상담"이 많다. 옛 백엔드 모듈 이름(`counseling`), 포트폴리오 사례 제목이 그렇다. 새 레포의 안내문도 처음에 "AI 상담 웹서비스"라고 썼다가 이 정책에 맞춰 고쳤다. 사용자에게 보이지 않는 곳은 강제하지 않되, 사용자에게 보이는 글로 새어 나가지 않게 한다.
- 대화 중 AI 의 말투 규칙(짧게, 질문은 한 번에 하나, 진부한 위로 문구 금지, 사용자가 먼저 꺼내지 않으면 "Rainbow Bridge" 같은 내세 표현을 쓰지 않음)은 톤 가이드에 있다. 웹 프롬프트로 옮길 때 이 문서를 참고한다.

## 근거

- `docs/research/legacy/v2/design/WORDING_POLICY.md`(최종 수정 2026-03-09): 금지어 표, 2.1 예외, 4.3 약속하지 않는 것, 7.1 스토어 카테고리.
- `docs/research/legacy/project-reference/legacy-CLAUDE.md` 의 "필수: 워딩 정책" 절.
- `docs/research/legacy/v2/design/FAQ_작성_가이드.md`, `docs/research/legacy/v2/design/상담사_톤_가이드.md`(말투 규칙, 금지 표현 목록).
- `apps/api/docs/01-product-overview.md` 설계 원칙 표: "치료가 아니라 정서적 지지", 의도적 제외 "의료 행위로 해석될 수 있는 모든 기능".
