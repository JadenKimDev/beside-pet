// 기간 선택(화면 안 5절). 고른 것은 주소 질의에 두고, 서버에는 `from`, `to` 만 보낸다.
// 7일은 서버의 기본값이라 아무것도 보내지 않는다. 직접 입력은 로컬 날짜의 0시부터 종료일 끝(다음 날 0시 − 1ms)까지다.
import type { PeriodQuery } from '@/entities/metrics';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 90;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const PERIOD_PRESETS = ['today', '7d', '30d'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** 고른 기간. 직접 입력의 `start`, `end` 는 로컬 달력 날짜 `YYYY-MM-DD` 다. */
export type PeriodSelection =
  | { preset: PeriodPreset }
  | { preset: 'custom'; start: string; end: string };
export type PeriodChoice = PeriodSelection['preset'];
export type CustomRange = { start: string; end: string };

export const DEFAULT_SELECTION: PeriodSelection = { preset: '7d' };

export const PERIOD_TEXT = {
  group: '기간',
  today: '오늘',
  '7d': '7일',
  '30d': '30일',
  custom: '직접 입력',
  start: '시작일',
  end: '종료일',
  missingDays: '시작일과 종료일을 골라 주세요.',
  endBeforeStart: '종료일이 시작일보다 앞이에요.',
  tooLong: '한 번에 90일까지 볼 수 있어요.',
  unreadable: '날짜를 읽지 못했어요. 다시 골라 주세요.',
} as const;

export const PERIOD_CHOICES: readonly PeriodChoice[] = [...PERIOD_PRESETS, 'custom'];

/** `YYYY-MM-DD` 를 로컬 0시로. 없는 날짜(2026-13-01, 2026-02-30)는 null. */
function localDay(key: string): Date | null {
  const match = DATE_KEY.exec(key);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 로컬 달력 날짜 `YYYY-MM-DD`. */
function localKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 서버에 보낼 질의. 비운 쪽은 서버 기본값을 따른다. */
export function periodQuery(selection: PeriodSelection, now: Date = new Date()): PeriodQuery {
  switch (selection.preset) {
    case 'today':
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
    case '7d':
      return {};
    case '30d':
      return { from: new Date(now.getTime() - 30 * DAY_MS).toISOString() };
    case 'custom': {
      const start = localDay(selection.start);
      const end = localDay(selection.end);
      if (!start || !end) return {};
      const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      return { from: start.toISOString(), to: new Date(next.getTime() - 1).toISOString() };
    }
  }
}

/** 직접 입력의 오류 문구. 맞으면 null. 날 수는 두 날짜를 모두 넣어 센다. */
export function customRangeError(start: string, end: string): string | null {
  const from = localDay(start);
  const to = localDay(end);
  if (!from || !to) return PERIOD_TEXT.missingDays;
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (utc(to) - utc(from)) / DAY_MS + 1;
  if (days < 1) return PERIOD_TEXT.endBeforeStart;
  if (days > MAX_DAYS) return PERIOD_TEXT.tooLong;
  return null;
}

/** 직접 입력으로 바꿀 때 처음 채우는 값: 오늘로 끝나는 7일. */
export function defaultCustomRange(now: Date = new Date()): CustomRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return { start: localKey(start), end: localKey(now) };
}

/** `URLSearchParams` 와 Next 의 `ReadonlyURLSearchParams` 가 함께 맞는 모양. */
export type SearchReader = { get: (name: string) => string | null };

/** 주소 질의(`?period=` 또는 `?from=&to=`)에서 고른 기간. 읽을 수 없으면 기본값. */
export function parsePeriodSearch(search: SearchReader): PeriodSelection {
  const period = search.get('period');
  const preset = PERIOD_PRESETS.find((value) => value === period);
  if (preset) return { preset };
  const start = search.get('from');
  const end = search.get('to');
  if (start && end && customRangeError(start, end) === null) {
    return { preset: 'custom', start, end };
  }
  return DEFAULT_SELECTION;
}

/** 고른 기간의 주소 질의 칸. 호출자가 다른 칸(거르기)과 합친다. */
export function periodSearch(selection: PeriodSelection): Record<string, string> {
  return selection.preset === 'custom'
    ? { from: selection.start, to: selection.end }
    : { period: selection.preset };
}

export function sameSelection(a: PeriodSelection, b: PeriodSelection): boolean {
  if (a.preset === 'custom' && b.preset === 'custom') {
    return a.start === b.start && a.end === b.end;
  }
  return a.preset === b.preset;
}

const SERVER_ERRORS: Record<string, string> = {
  'to must not be before from': PERIOD_TEXT.endBeforeStart,
  'Range must be at most 90 days': PERIOD_TEXT.tooLong,
  'from must be a valid ISO 8601 date string': PERIOD_TEXT.unreadable,
  'to must be a valid ISO 8601 date string': PERIOD_TEXT.unreadable,
};

/** 서버의 기간 400 문구를 한국어로. 모르는 문구는 그대로. */
export function periodErrorText(message: string): string {
  return SERVER_ERRORS[message] ?? message;
}

function localMinute(iso: string): string {
  const date = new Date(iso);
  return `${localKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 응답의 `from`, `to` 를 로컬 시각으로: "2026-10-14 09:00 ~ 2026-10-21 15:42". */
export function formatRange(from: string, to: string): string {
  return `${localMinute(from)} ~ ${localMinute(to)}`;
}
