-- 로그아웃의 사실 하나: 이 시각(초 단위로 내림)보다 앞선 초에 발급한 그 계정의 토큰은 받지 않는다.
-- 기존 행은 NULL(로그아웃한 적 없음 = 제한 없음)이다. 토큰 저장소나 블랙리스트는 두지 않는다.
ALTER TABLE "accounts" ADD COLUMN "tokens_valid_from" timestamptz;
