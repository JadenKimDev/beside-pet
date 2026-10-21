'use client';

import { type FormEvent, useState } from 'react';
import { useStore } from 'zustand';
import type { AccountRecord, AccountRole } from '@/entities/account';
import { Alert, Button, Field, Input, Modal, Select, type SelectOption } from '@/shared/ui';
import { ISSUE_TEXT, type IssueAccountDraft } from '../model/form';
import { createIssueAccountStore } from '../model/store';

export type IssueAccountFormProps = {
  /** 계정을 만들었다. 목록 다시 받기와 알림은 호출자가 한다. */
  onCreated: (account: AccountRecord) => void;
  onCancel?: () => void;
};

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'viewer', label: ISSUE_TEXT.roleViewer },
  { value: 'admin', label: ISSUE_TEXT.roleAdmin },
];

type TextField = Exclude<keyof IssueAccountDraft, 'role'>;

const TEXT_FIELDS: { field: TextField; type: string; autoComplete: string }[] = [
  { field: 'username', type: 'text', autoComplete: 'off' },
  { field: 'password', type: 'password', autoComplete: 'new-password' },
  { field: 'company', type: 'text', autoComplete: 'organization' },
  { field: 'expiresAt', type: 'datetime-local', autoComplete: 'off' },
];

const toRole = (value: string): AccountRole => (value === 'admin' ? 'admin' : 'viewer');

export function IssueAccountForm({ onCreated, onCancel }: IssueAccountFormProps) {
  const [store] = useState(createIssueAccountStore);
  const { draft, fieldErrors, busy, error, setField, submit, reset } = useStore(store);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = await submit();
    if (!account) return;
    reset();
    onCreated(account);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 text-fg">
      {error && <Alert tone="danger">{error}</Alert>}
      {TEXT_FIELDS.map(({ field, type, autoComplete }) => (
        <Field
          key={field}
          label={
            field === 'expiresAt'
              ? `${ISSUE_TEXT.expiresAt} (${ISSUE_TEXT.expiresAtHint})`
              : ISSUE_TEXT[field]
          }
          htmlFor={`issue-${field}`}
          error={fieldErrors[field]}
        >
          <Input
            id={`issue-${field}`}
            type={type}
            autoComplete={autoComplete}
            value={draft[field]}
            aria-invalid={fieldErrors[field] ? true : undefined}
            onChange={(event) => setField(field, event.target.value)}
          />
        </Field>
      ))}
      <Field label={ISSUE_TEXT.role} htmlFor="issue-role">
        <Select
          id="issue-role"
          options={ROLE_OPTIONS}
          value={draft.role}
          onChange={(event) => setField('role', toRole(event.target.value))}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {ISSUE_TEXT.cancel}
          </Button>
        )}
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? ISSUE_TEXT.submitting : ISSUE_TEXT.submit}
        </Button>
      </div>
    </form>
  );
}

export type IssueAccountDialogProps = IssueAccountFormProps & {
  open: boolean;
  onClose: () => void;
};

/** `계정 발급` 버튼이 여는 모달. 닫으면 폼을 버린다(비밀번호를 남기지 않는다). */
export function IssueAccountDialog({ open, onClose, onCreated }: IssueAccountDialogProps) {
  return (
    <Modal open={open} title={ISSUE_TEXT.title} onClose={onClose}>
      {open && <IssueAccountForm onCreated={onCreated} onCancel={onClose} />}
    </Modal>
  );
}
