'use client';

/**
 * AccountTable — lists every account. Deleted/expired rows are greyed out and labelled.
 * Actions: revoke, soft-delete, reactivate, and set/extend/clear expiry (local → UTC).
 * The admin's own (role: admin) rows are protected from destructive actions to avoid self-lockout.
 */
import { useState } from 'react';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { Messages } from '@/i18n/messages';
import { useAdminStore } from '../admin.store';
import { fromLocalInput, toLocalDisplay, toLocalInput } from '../admin.time';
import type { Account } from '../admin.types';

const statusLabel = (account: Account, t: Messages['admin']): string => {
  if (account.status === 'pending') {
    return t.statusPending;
  }
  if (account.status === 'deleted') {
    return t.statusDeleted;
  }
  if (account.status === 'revoked') {
    return t.statusRevoked;
  }
  return account.expired ? t.statusExpired : t.statusActive;
};

const isDimmed = (account: Account): boolean =>
  account.status === 'revoked' || account.status === 'deleted' || account.expired;

/** Pending applications float to the top so they get acted on. */
const byPendingFirst = (a: Account, b: Account): number =>
  Number(b.status === 'pending') - Number(a.status === 'pending');

export function AccountTable() {
  const t = useTranslations().admin;
  const accounts = useAdminStore((s) => s.accounts);

  if (accounts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t.empty}</p>;
  }
  const ordered = [...accounts].sort(byPendingFirst);

  return (
    <div className="overflow-x-auto rounded-xl border border-black/10">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/10 text-xs text-muted">
          <tr>
            <th className="px-3 py-2">{t.columnUsername}</th>
            <th className="px-3 py-2">{t.columnCompany}</th>
            <th className="px-3 py-2">{t.columnStatus}</th>
            <th className="px-3 py-2">{t.columnExpiry}</th>
            <th className="px-3 py-2">{t.columnLastLogin}</th>
            <th className="px-3 py-2">{t.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const t = useTranslations().admin;
  const { locale } = useLocale();
  const busy = useAdminStore((s) => s.busy);
  const approve = useAdminStore((s) => s.approve);
  const revoke = useAdminStore((s) => s.revoke);
  const softDelete = useAdminStore((s) => s.softDelete);
  const reactivate = useAdminStore((s) => s.reactivate);

  const dimmed = isDimmed(account);
  const isAdmin = account.role === 'admin';

  return (
    <tr className={`border-b border-black/5 align-top ${dimmed ? 'opacity-50' : ''}`}>
      <td className="px-3 py-2 font-medium">
        {account.username}
        {isAdmin && <span className="ml-1 text-xs text-accent">(admin)</span>}
      </td>
      <td className="px-3 py-2">{account.company}</td>
      <td className={`px-3 py-2 ${account.status === 'pending' ? 'font-medium text-accent' : ''}`}>
        {statusLabel(account, t)}
      </td>
      <td className="px-3 py-2">
        {isAdmin ? <span className="text-muted">—</span> : <ExpiryEditor account={account} />}
      </td>
      <td className="px-3 py-2 text-muted">{toLocalDisplay(account.lastLoginAt, locale)}</td>
      <td className="px-3 py-2">
        {isAdmin ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {account.status === 'pending' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void approve(account.id)}
                className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {t.approve}
              </button>
            )}
            {account.status === 'active' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke(account.id)}
                className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50"
              >
                {t.revoke}
              </button>
            )}
            {(account.status === 'revoked' || account.status === 'deleted') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reactivate(account.id)}
                className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50"
              >
                {t.reactivate}
              </button>
            )}
            {account.status !== 'deleted' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void softDelete(account.id)}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
              >
                {t.delete}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function ExpiryEditor({ account }: { account: Account }) {
  const t = useTranslations().admin;
  const { locale } = useLocale();
  const busy = useAdminStore((s) => s.busy);
  const setExpiry = useAdminStore((s) => s.setExpiry);
  const [value, setValue] = useState(toLocalInput(account.expiresAt));

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted">{toLocalDisplay(account.expiresAt, locale)}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded border border-black/15 bg-transparent px-1.5 py-1 text-xs"
        />
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => void setExpiry(account.id, fromLocalInput(value))}
          className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50"
        >
          {t.setExpiry}
        </button>
        {account.expiresAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setValue('');
              void setExpiry(account.id, undefined);
            }}
            className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50"
          >
            {t.clearExpiry}
          </button>
        )}
      </div>
    </div>
  );
}
