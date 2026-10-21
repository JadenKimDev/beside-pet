import { describe, expect, it } from 'vitest';
import {
  EMPTY_ISSUE_DRAFT,
  ISSUE_TEXT,
  type IssueAccountDraft,
  toCreateAccountInput,
  validateIssueDraft,
} from './form';

const valid: IssueAccountDraft = {
  username: 'demo-viewer',
  password: 'example-pass-1',
  company: '예시 동물병원',
  role: 'viewer',
  expiresAt: '',
};

describe('validateIssueDraft', () => {
  it('accepts what the server accepts', () => {
    expect(validateIssueDraft(valid)).toEqual({});
    expect(validateIssueDraft({ ...valid, username: 'abc', password: '12345678' })).toEqual({});
  });

  it('starts empty with the viewer role', () => {
    expect(EMPTY_ISSUE_DRAFT).toEqual({
      username: '',
      password: '',
      company: '',
      role: 'viewer',
      expiresAt: '',
    });
  });

  it('marks a username under 3 characters', () => {
    expect(validateIssueDraft({ ...valid, username: 'ab' })).toEqual({
      username: ISSUE_TEXT.usernameTooShort,
    });
    expect(ISSUE_TEXT.usernameTooShort).toBe('아이디는 3자 이상이에요.');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validateIssueDraft({ ...valid, username: '🐶🐱' })).toEqual({
      username: ISSUE_TEXT.usernameTooShort,
    });
  });

  it('marks a password under 8 characters and an empty company', () => {
    expect(validateIssueDraft({ ...valid, password: '1234567', company: '' })).toEqual({
      password: ISSUE_TEXT.passwordTooShort,
      company: ISSUE_TEXT.companyRequired,
    });
  });

  it('marks an unreadable expiry', () => {
    expect(validateIssueDraft({ ...valid, expiresAt: 'tomorrow' })).toEqual({
      expiresAt: ISSUE_TEXT.expiryUnreadable,
    });
  });
});

describe('toCreateAccountInput', () => {
  it('leaves out an empty expiry', () => {
    expect(toCreateAccountInput(valid)).toEqual({
      username: 'demo-viewer',
      password: 'example-pass-1',
      company: '예시 동물병원',
      role: 'viewer',
    });
  });

  it('sends the local datetime as ISO', () => {
    expect(
      toCreateAccountInput({ ...valid, role: 'admin', expiresAt: '2026-12-31T23:59' }),
    ).toEqual({
      username: 'demo-viewer',
      password: 'example-pass-1',
      company: '예시 동물병원',
      role: 'admin',
      expiresAt: new Date(2026, 11, 31, 23, 59).toISOString(),
    });
  });
});
