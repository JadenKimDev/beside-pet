---
id: ADR-0001
date: 2026-02-26
status: superseded
tags: [market, locale, language, legacy-mobile]
related: [ADR-0002, ADR-0009, ADR-0012]
---
# 모바일 시기의 대상은 미국 시장이었고, 사용자에게 보이는 글은 모두 영어였다

> 2026-10-16 기준 `superseded`. 웹 제품은 다른 기준으로 움직이고 있다(ADR-0002). 옛 결정이 어떤 문서와 법적 검토를 낳았는지 알아 두려고 남긴다.

## 맥락

Flutter 앱과 그 API 를 만들던 2026년 2월부터 3월까지, 프로젝트의 규칙 파일은 "이 앱은 미국 시장을 위해 개발되고 있다"를 맨 앞에 두었다. 개발과 테스트는 한국에서 하되 운영은 미국에서 한다는 전제였다. 이 전제 하나가 문구, 날짜 형식, 법률 검토, 위기 연락처, 인프라 리전까지 정했다.

## 결정

- 대상 시장은 미국, 로케일은 en-US, 기본 시간대는 America/New_York 이었다.
- 오류 문구, 알림, UI 를 포함해 사용자 대면 텍스트는 모두 영어로 쓰고, 상수로 관리했다. 날짜는 MM/DD/YYYY 와 12시간제, 통화는 USD, 단위는 파운드와 인치였다.
- 법은 미국 기준이었다. COPPA, CCPA, ADA 를 지키고 HIPAA 는 "해당 시 고려"로 두었다(자세한 것은 ADR-0012).
- 위기 연락처는 미국 기준이었다. 988 Suicide & Crisis Lifeline, Crisis Text Line(741741), ASPCA Animal Poison Control.
- 개발과 테스트는 한국 리전, 운영은 미국 리전(AWS us-east-1 또는 us-west-2, Supabase US)을 쓰기로 했다.
- 다국어는 Phase 2 이후로 미루었다.

## 버린 것

| 안 | 이유 |
|---|---|
| 한국 시장 먼저 | 원 문서에 비교 근거는 남아 있지 않다. 남은 흔적은 Kakao 연동 설정이 주석으로 남았다가 "미국 시장 타겟이므로 제거 가능"으로 정리된 것뿐이다 |
| 처음부터 다국어 | MVP 범위를 줄이려고 영어 하나로 시작했다 |

## 결과

- 사업계획서, 마케팅 전략, 경쟁 분석, 약관과 개인정보 가이드가 모두 미국 기준으로 쓰였다. 이 문서들은 `docs/research/legacy/` 에 로컬로만 남아 있고, 다시 쓸 때는 대상 시장이 같은지부터 확인해야 한다.
- 미국 리전의 운영 환경은 끝내 만들어지지 않았다. 2026-03-26 중단 때 운영 GCP 프로젝트는 설정 파일에만 있었다(DEV-2026-03-26-project-pause).
- 웹 제품으로 옮기면서 이 결정은 지켜지지 않았다. 웹은 서울 리전에 올라갔고 위기 연락처는 한국 번호다. 그 사실은 ADR-0002 에 적는다.

## 근거

- 옛 프로젝트 규칙 파일 `docs/research/legacy/project-reference/legacy-CLAUDE.md` 의 "중요: 미국 시장 타겟 앱", "법적 준수 사항", "배포 및 인프라" 절.
- `docs/research/legacy/v2/design/WORDING_POLICY.md` 5.1 절(미국 위기 연락처).
- `docs/research/legacy/v2/legal/약관_및_가이드라인.md` 머리("Target Market: United States")와 끝의 개발 위치(한국, 테스트 목적), `docs/research/legacy/v2/business/사업_계획서.md` 머리("미국, 캘리포니아 우선"). 사업계획서는 캐나다(2027 상반기), 영국, 호주 확장과 스페인어를 뒤의 단계로 두었다.
- `docs/research/legacy/v3/문서_코드_불일치_분석_리포트.md` m-3(Kakao 잔재 정리).
- `docs/research/legacy/PROJECT_PAUSE_2026-03-26.md` 9절 "기억해야 할 설계 결정"의 "미국 시장 타겟".
