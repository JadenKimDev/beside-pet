// 목록 화면의 날짜 글. 글자는 Intl 이 그 언어로 만든다(ko: "10월 16일 금요일", "목 오후 9:12").
import type { Locale } from '@/i18n/config';

const format = (locale: Locale, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, options);

/** 인사 위의 오늘 날짜. */
export function todayLabel(now: Date, locale: Locale): string {
  return format(locale, { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
}

/** 지난 대화 항목의 날짜 상자: 일(두 자리)과 달. */
export function dateBox(iso: string, locale: Locale): { day: string; month: string } {
  const date = new Date(iso);
  // ko 의 day 단독 형식은 "12일" 이라 숫자 칸만 꺼낸다.
  const day = format(locale, { day: '2-digit' })
    .formatToParts(date)
    .find((part) => part.type === 'day')?.value;
  return {
    day: day ?? String(date.getDate()),
    month: format(locale, { month: 'short' }).format(date),
  };
}

/** 항목 보조 줄의 요일과 시각("월 오후 9:12"). 함께 형식을 주면 ko 가 요일을 괄호로 감싸 따로 만든다. */
export function weekdayTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  const weekday = format(locale, { weekday: 'short' }).format(date);
  const time = format(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${weekday} ${time}`;
}

/** 삭제 확인 본문의 날짜(10월 12일). */
export function monthDay(iso: string, locale: Locale): string {
  return format(locale, { month: 'long', day: 'numeric' }).format(new Date(iso));
}
