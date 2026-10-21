// 계정 표가 받은 목록에서 구하는 것. 서버는 집계를 저장하지 않으므로 화면이 목록에서 계산한다.
import {
  ACCOUNT_STATE_LABELS,
  type Account,
  type AccountFilter,
  type AccountState,
  COUNTED_STATES,
  type CountedState,
  countByState,
  filterAccounts,
  sortAccounts,
} from '@/entities/account';

export const ACCOUNT_TABLE_TEXT = {
  allStates: '전체',
  stateLabel: '상태',
  searchLabel: '아이디나 소속으로 찾기',
  summaryLabel: '상태별 계정 수',
  username: '아이디',
  company: '소속',
  state: '상태',
  sessionCount: '대화 수',
  lastActive: '마지막 활동',
  lastLogin: '마지막 로그인',
  expiry: '만료',
  actions: '동작',
  adminBadge: '관리자',
  noExpiry: '기한 없음',
  none: '—',
  justNow: '방금 전',
  empty: '아직 계정이 없어요.',
  emptyHint: '오른쪽 위 계정 발급으로 만들어요.',
  noMatch: '찾는 계정이 없어요.',
  loading: '불러오고 있어요',
} as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 정렬(승인 대기 위, 최신 먼저) 뒤 상태와 찾는 글로 거른다. */
export function visibleAccounts(
  accounts: readonly Account[],
  filter: AccountFilter,
  query: string,
): Account[] {
  return filterAccounts(sortAccounts(accounts), filter, query);
}

export type SummaryCard = { state: CountedState; label: string; count: number };

export function summaryCards(accounts: readonly Account[]): SummaryCard[] {
  const counts = countByState(accounts);
  return COUNTED_STATES.map((state) => ({
    state,
    label: ACCOUNT_STATE_LABELS[state],
    count: counts[state],
  }));
}

const FILTER_STATES: readonly AccountState[] = [
  'pending',
  'active',
  'expired',
  'revoked',
  'deleted',
];

export function stateFilterOptions(): { value: AccountFilter; label: string }[] {
  return [
    { value: 'all', label: ACCOUNT_TABLE_TEXT.allStates },
    ...FILTER_STATES.map((state) => ({ value: state, label: ACCOUNT_STATE_LABELS[state] })),
  ];
}

export function toAccountFilter(value: string): AccountFilter {
  return stateFilterOptions().find((option) => option.value === value)?.value ?? 'all';
}

/** "3일 전" 같은 상대 시각. 없으면 "—". */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return ACCOUNT_TABLE_TEXT.none;
  const elapsed = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (elapsed < MINUTE_MS) return ACCOUNT_TABLE_TEXT.justNow;
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}분 전`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}시간 전`;
  return `${Math.floor(elapsed / DAY_MS)}일 전`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 로컬 시각의 `YYYY-MM-DD HH:mm`. */
export function formatLocalTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function formatExpiry(iso: string | undefined): string {
  return iso ? formatLocalTime(iso) : ACCOUNT_TABLE_TEXT.noExpiry;
}
