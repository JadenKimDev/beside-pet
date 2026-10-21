'use client';

import { useState } from 'react';
import type { Account } from '@/entities/account';
import { Button, Field, Input, Modal } from '@/shared/ui';
import { EXPIRY_QUICK_DAYS, fromLocalInput, quickExpiry, toLocalInput } from '../model/expiry';
import { DIALOG_TEXT } from '../model/texts';

export type ExpiryDialogProps = {
  account: Pick<Account, 'username' | 'expiresAt'>;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  /** 저장. `expiresAt` 이 없으면 만료를 지운다. */
  onSave: (expiresAt?: string) => void;
};

/** 만료 설정·연장. 열 때마다 지금 만료일로 칸을 채운다. */
export function ExpiryDialog({ account, open, busy, onClose, onSave }: ExpiryDialogProps) {
  return (
    <Modal open={open} title={DIALOG_TEXT.expiryTitle(account.username)} onClose={onClose}>
      {open && <ExpiryForm account={account} busy={busy} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function ExpiryForm({ account, busy, onClose, onSave }: Omit<ExpiryDialogProps, 'open'>) {
  const [value, setValue] = useState(() => toLocalInput(account.expiresAt));
  const expiresAt = fromLocalInput(value);

  return (
    <div className="flex flex-col gap-3 text-fg">
      <Field label={DIALOG_TEXT.expiryInput} htmlFor="expiry-at">
        <Input
          id="expiry-at"
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {EXPIRY_QUICK_DAYS.map((days) => (
          <Button
            key={days}
            variant="secondary"
            size="sm"
            onClick={() => setValue(quickExpiry(account.expiresAt, days))}
          >
            {DIALOG_TEXT.quick(days)}
          </Button>
        ))}
        {account.expiresAt !== undefined && (
          <Button variant="ghost" size="sm" busy={busy} onClick={() => onSave(undefined)}>
            {DIALOG_TEXT.clearExpiry}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {DIALOG_TEXT.cancel}
        </Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={expiresAt === undefined}
          onClick={() => onSave(expiresAt)}
        >
          {DIALOG_TEXT.save}
        </Button>
      </div>
    </div>
  );
}
