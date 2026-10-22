'use client';

import { useState } from 'react';
import type { Account } from '@/entities/account';
import { Button, Field, Input, Modal } from '@/shared/ui';
import { canPurge } from '../model/actions';
import { CONFIRM_TEXT, DIALOG_TEXT } from '../model/texts';

export type DeleteDialogProps = {
  account: Pick<Account, 'username' | 'status' | 'deletedAt'>;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/** 완전 삭제의 확인. 아이디를 그대로 입력해야 버튼이 켜진다. */
export function DeleteDialog({ account, open, busy, onClose, onConfirm }: DeleteDialogProps) {
  const [typed, setTyped] = useState('');
  const text = CONFIRM_TEXT.purge;

  function close() {
    setTyped('');
    onClose();
  }

  return (
    <Modal
      open={open}
      title={text.title(account.username)}
      onClose={close}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {DIALOG_TEXT.cancel}
          </Button>
          <Button
            variant="danger"
            busy={busy}
            disabled={!canPurge(account, typed)}
            onClick={onConfirm}
          >
            {text.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>{text.body}</p>
        <Field label={DIALOG_TEXT.typeUsername(account.username)} htmlFor="purge-username">
          <Input
            id="purge-username"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
