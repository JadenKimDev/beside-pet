'use client';

import type { Account } from '@/entities/account';
import { Button, Modal } from '@/shared/ui';
import { CONFIRM_TEXT, DIALOG_TEXT } from '../model/texts';

export type ConfirmDialogProps = {
  account: Pick<Account, 'username'>;
  action: 'revoke' | 'softDelete';
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/** 정지와 삭제(소프트)의 확인. */
export function ConfirmDialog({
  account,
  action,
  open,
  busy,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const text = CONFIRM_TEXT[action];
  return (
    <Modal
      open={open}
      title={text.title(account.username)}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {DIALOG_TEXT.cancel}
          </Button>
          <Button variant="danger" busy={busy} onClick={onConfirm}>
            {text.confirm}
          </Button>
        </>
      }
    >
      {text.body}
    </Modal>
  );
}
