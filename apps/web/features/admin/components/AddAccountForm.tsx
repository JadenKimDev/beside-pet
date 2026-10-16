'use client';

/**
 * AddAccountForm — admin issues a new account (username, password, company, optional expiry).
 * The expiry datetime-local (admin's local timezone) is converted to an absolute UTC instant.
 */
import { type FormEvent, useState } from 'react';
import { useTranslations } from '@/i18n/I18nProvider';
import { useAdminStore } from '../admin.store';
import { fromLocalInput } from '../admin.time';

export function AddAccountForm() {
  const t = useTranslations().admin;
  const create = useAdminStore((s) => s.create);
  const busy = useAdminStore((s) => s.busy);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [expiry, setExpiry] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await create({ username, password, company, expiresAt: fromLocalInput(expiry) });
    setUsername('');
    setPassword('');
    setCompany('');
    setExpiry('');
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-black/10 p-4 sm:grid-cols-5 sm:items-end"
    >
      <label className="space-y-1">
        <span className="text-xs text-muted">{t.formUsername}</span>
        <input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted">{t.formPassword}</span>
        <input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted">{t.formCompany}</span>
        <input
          name="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted">{t.formExpiry}</span>
        <input
          type="datetime-local"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !username || !password || !company}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {t.formSubmit}
      </button>
    </form>
  );
}
