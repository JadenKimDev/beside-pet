'use client';

/**
 * AccountTable — the filtered account list: a table on wide screens, a card list on
 * phones (both render the same rows; CSS shows one). Actions per state are the same
 * as before: pending → approve / delete, active → expiry / revoke, revoked or deleted
 * → reactivate (+ delete), expired → extend expiry. Delete and revoke only ask —
 * the confirm modal lives in AdminConsole. Admin rows are protected from destructive
 * actions to avoid self-lockout.
 */
import { useState } from 'react';
import { Badge, type BadgeTone, Button, cx } from '@/components/ui';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { Messages } from '@/i18n/messages';
import { useAdminStore } from '../admin.store';
import { fromLocalInput, toLocalDisplay, toLocalInput } from '../admin.time';
import type { Account } from '../admin.types';
import { type AccountState, accountState } from '../admin.view';

export type ConfirmKind = 'delete' | 'revoke';
export type AskConfirm = (kind: ConfirmKind, account: Account) => void;

const STATE_TONE: Record<AccountState, BadgeTone> = {
  pending: 'warn',
  active: 'live',
  expired: 'default',
  revoked: 'danger',
  deleted: 'default',
};

export const stateLabel = (state: AccountState, t: Messages['admin']): string =>
  ({
    pending: t.statusPending,
    active: t.statusActive,
    expired: t.statusExpired,
    revoked: t.statusRevoked,
    deleted: t.statusDeleted,
  })[state];

const isDimmed = (state: AccountState): boolean =>
  state === 'revoked' || state === 'deleted' || state === 'expired';

export function AccountTable({
  accounts,
  onAsk,
}: {
  accounts: readonly Account[];
  onAsk: AskConfirm;
}) {
  const t = useTranslations().admin;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface max-sm:hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">{t.columnUsername}</th>
              <th className="px-4 py-3 font-semibold">{t.columnCompany}</th>
              <th className="px-4 py-3 font-semibold">{t.columnStatus}</th>
              <th className="px-4 py-3 font-semibold">{t.columnExpiry}</th>
              <th className="px-4 py-3 font-semibold">{t.columnLastLogin}</th>
              <th className="px-4 py-3 font-semibold">{t.columnActions}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <AccountRow key={account.id} account={account} onAsk={onAsk} />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 sm:hidden">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} onAsk={onAsk} />
        ))}
      </ul>
    </>
  );
}

function Username({ account }: { account: Account }) {
  const t = useTranslations().admin;
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-fg">
      {account.username}
      {account.role === 'admin' && <Badge>{t.badge}</Badge>}
    </span>
  );
}

function StateBadge({ state }: { state: AccountState }) {
  const t = useTranslations().admin;
  return <Badge tone={STATE_TONE[state]}>{stateLabel(state, t)}</Badge>;
}

function AccountRow({ account, onAsk }: { account: Account; onAsk: AskConfirm }) {
  const { locale } = useLocale();
  const state = accountState(account);
  const isAdmin = account.role === 'admin';
  return (
    <tr
      className={cx(
        'border-b border-border align-top last:border-b-0',
        isDimmed(state) && 'text-fg-muted',
      )}
    >
      <td className="px-4 py-3">
        <Username account={account} />
      </td>
      <td className="px-4 py-3">{account.company}</td>
      <td className="px-4 py-3">
        <StateBadge state={state} />
      </td>
      <td className="px-4 py-3">
        {isAdmin ? <span className="text-fg-muted">—</span> : <ExpiryEditor account={account} />}
      </td>
      <td className="px-4 py-3 text-fg-muted">{toLocalDisplay(account.lastLoginAt, locale)}</td>
      <td className="px-4 py-3">
        {isAdmin ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <Actions account={account} onAsk={onAsk} />
        )}
      </td>
    </tr>
  );
}

function AccountCard({ account, onAsk }: { account: Account; onAsk: AskConfirm }) {
  const t = useTranslations().admin;
  const { locale } = useLocale();
  const state = accountState(account);
  const isAdmin = account.role === 'admin';
  return (
    <li className="grid gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <Username account={account} />
          <span className="text-small text-fg-muted">{account.company}</span>
        </div>
        <StateBadge state={state} />
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
        <dt className="text-fg-muted">{t.columnLastLogin}</dt>
        <dd className="m-0">{toLocalDisplay(account.lastLoginAt, locale)}</dd>
      </dl>
      {!isAdmin && (
        <>
          <ExpiryEditor account={account} />
          <Actions account={account} onAsk={onAsk} />
        </>
      )}
    </li>
  );
}

function Actions({ account, onAsk }: { account: Account; onAsk: AskConfirm }) {
  const t = useTranslations().admin;
  const busy = useAdminStore((s) => s.busy);
  const approve = useAdminStore((s) => s.approve);
  const reactivate = useAdminStore((s) => s.reactivate);
  return (
    <div className="flex flex-wrap gap-1.5">
      {account.status === 'pending' && (
        <Button size="sm" disabled={busy} onClick={() => void approve(account.id)}>
          {t.approve}
        </Button>
      )}
      {account.status === 'active' && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onAsk('revoke', account)}
        >
          {t.revoke}
        </Button>
      )}
      {(account.status === 'revoked' || account.status === 'deleted') && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void reactivate(account.id)}
        >
          {t.reactivate}
        </Button>
      )}
      {account.status !== 'deleted' && (
        <Button
          size="sm"
          variant="danger-ghost"
          disabled={busy}
          onClick={() => onAsk('delete', account)}
        >
          {t.delete}
        </Button>
      )}
    </div>
  );
}

function ExpiryEditor({ account }: { account: Account }) {
  const t = useTranslations().admin;
  const { locale } = useLocale();
  const busy = useAdminStore((s) => s.busy);
  const setExpiry = useAdminStore((s) => s.setExpiry);
  const [value, setValue] = useState(toLocalInput(account.expiresAt));

  return (
    <div className="grid gap-1.5">
      <div className="text-xs text-fg-muted">
        {account.expiresAt ? toLocalDisplay(account.expiresAt, locale) : t.noExpiry}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="datetime-local"
          aria-label={t.columnExpiry}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-fg focus:border-accent focus:outline-none"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !value}
          onClick={() => void setExpiry(account.id, fromLocalInput(value))}
        >
          {t.setExpiry}
        </Button>
        {account.expiresAt && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setValue('');
              void setExpiry(account.id, undefined);
            }}
          >
            {t.clearExpiry}
          </Button>
        )}
      </div>
    </div>
  );
}
