// 공개 설정. 브라우저에 실려도 되는 값만 둔다. API_BASE_URL 은 Next 서버의 값이라 여기 두지 않는다.

export const APP_NAME = 'Beside Pet 운영';

/** 기간 선택의 기본값과 고를 수 있는 값(일). */
export const DEFAULT_PERIOD_DAYS = 7;
export const PERIOD_DAYS_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_DAYS_OPTIONS)[number];
