// 발급 폼(화면 안 8절). 서버의 `CreateAccountRequest`(apps/server/src/identity/api/request.rs 의 `create_account`)가
// 거부하는 것을 먼저 보인다: 아이디 3자 미만, 비밀번호 8자 미만, 빈 소속, ISO 가 아닌 만료. 그 밖은 서버 문구를 그대로.
import type { AccountRole, CreateAccountInput } from '@/entities/account';

export type IssueAccountDraft = {
  username: string;
  password: string;
  company: string;
  role: AccountRole;
  /** `datetime-local` 의 값(로컬 시각). 비면 만료 없음. */
  expiresAt: string;
};

export type IssueField = keyof IssueAccountDraft;
export type IssueFieldErrors = Partial<Record<IssueField, string>>;

export const EMPTY_ISSUE_DRAFT: IssueAccountDraft = {
  username: '',
  password: '',
  company: '',
  role: 'viewer',
  expiresAt: '',
};

export const ISSUE_TEXT = {
  title: '계정 발급',
  username: '아이디',
  password: '비밀번호',
  company: '소속',
  role: '역할',
  expiresAt: '만료',
  expiresAtHint: '비우면 기한 없음',
  roleViewer: '일반 (viewer)',
  roleAdmin: '관리자 (admin)',
  cancel: '취소',
  submit: '발급',
  submitting: '만드는 중…',
  usernameTooShort: '아이디는 3자 이상이에요.',
  passwordTooShort: '비밀번호는 8자 이상이에요.',
  companyRequired: '소속을 입력해 주세요.',
  expiryUnreadable: '만료 시각을 읽지 못했어요.',
  failedPrefix: '만들지 못했어요: ',
  networkFailed: '만들지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

/** 서버의 길이 검사처럼 글자(코드 포인트)로 센다. */
const length = (text: string) => [...text].length;

function localToIso(value: string): string | undefined {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function validateIssueDraft(draft: IssueAccountDraft): IssueFieldErrors {
  const errors: IssueFieldErrors = {};
  if (length(draft.username) < 3) errors.username = ISSUE_TEXT.usernameTooShort;
  if (length(draft.password) < 8) errors.password = ISSUE_TEXT.passwordTooShort;
  if (draft.company === '') errors.company = ISSUE_TEXT.companyRequired;
  if (draft.expiresAt !== '' && localToIso(draft.expiresAt) === undefined) {
    errors.expiresAt = ISSUE_TEXT.expiryUnreadable;
  }
  return errors;
}

/** 서버에 보낼 본문. 빈 만료는 칸을 뺀다. */
export function toCreateAccountInput(draft: IssueAccountDraft): CreateAccountInput {
  const expiresAt = draft.expiresAt === '' ? undefined : localToIso(draft.expiresAt);
  return {
    username: draft.username,
    password: draft.password,
    company: draft.company,
    role: draft.role,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}
