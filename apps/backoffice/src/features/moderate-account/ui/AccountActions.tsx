'use client';

import { useState } from 'react';
import type { Account } from '@/entities/account';
import { Button, type ButtonVariant } from '@/shared/ui';
import { MODERATION_LABELS, type ModerationAction } from '../model/actions';
import type { ModerationRequest } from '../model/moderation';
import { DIALOG_TEXT } from '../model/texts';
import { type ModerateAccountOptions, useModerateAccount } from '../model/useModerateAccount';
import { ConfirmDialog } from './ConfirmDialog';
import { DeleteDialog } from './DeleteDialog';
import { ExpiryDialog } from './ExpiryDialog';

export type AccountActionsProps = ModerateAccountOptions & {
  account: Account;
};

const VARIANTS: Record<ModerationAction, ButtonVariant> = {
  approve: 'primary',
  setExpiry: 'secondary',
  extendExpiry: 'secondary',
  revoke: 'secondary',
  reactivate: 'secondary',
  restore: 'secondary',
  softDelete: 'ghost',
  purge: 'danger',
};

type Dialog = 'revoke' | 'softDelete' | 'purge' | 'expiry' | null;

const DIRECT: Partial<Record<ModerationAction, ModerationRequest>> = {
  approve: { kind: 'approve' },
  reactivate: { kind: 'reactivate' },
  restore: { kind: 'restore' },
};

function dialogOf(action: ModerationAction): Dialog {
  if (action === 'setExpiry' || action === 'extendExpiry') return 'expiry';
  if (action === 'revoke' || action === 'softDelete' || action === 'purge') return action;
  return null;
}

/** 계정 행의 버튼들과 그 모달. 관리자 행은 "—". */
export function AccountActions({ account, onChanged, onError }: AccountActionsProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { actions, busy, perform } = useModerateAccount(account, { onChanged, onError });

  if (actions.length === 0) return <span className="text-fg-muted">{DIALOG_TEXT.noAction}</span>;

  async function act(request: ModerationRequest) {
    const result = await perform(request);
    if (result) setDialog(null);
  }

  function press(action: ModerationAction) {
    const direct = DIRECT[action];
    if (direct) void act(direct);
    else setDialog(dialogOf(action));
  }

  const close = () => setDialog(null);

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={VARIANTS[action]}
          disabled={busy !== null}
          busy={busy !== null && DIRECT[action]?.kind === busy}
          onClick={() => press(action)}
        >
          {MODERATION_LABELS[action]}
        </Button>
      ))}
      {(dialog === 'revoke' || dialog === 'softDelete') && (
        <ConfirmDialog
          account={account}
          action={dialog}
          open
          busy={busy !== null}
          onClose={close}
          onConfirm={() => act({ kind: dialog })}
        />
      )}
      {dialog === 'purge' && (
        <DeleteDialog
          account={account}
          open
          busy={busy !== null}
          onClose={close}
          onConfirm={() => act({ kind: 'purge' })}
        />
      )}
      {dialog === 'expiry' && (
        <ExpiryDialog
          account={account}
          open
          busy={busy !== null}
          onClose={close}
          onSave={(expiresAt) => act({ kind: 'setExpiry', expiresAt })}
        />
      )}
    </div>
  );
}
