'use client';

/**
 * AddAccountForm — admin issues a new account (username, password, company, optional expiry).
 * The expiry datetime-local (admin's local timezone) is converted to an absolute UTC instant.
 * One row on wide screens, stacked on phones.
 */
import { type FormEvent, useState } from 'react';
import { Button, Field, Icon, Input } from '@/components/ui';
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
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
    >
      <Field label={t.formUsername}>
        {(control) => (
          <Input
            {...control}
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
      </Field>
      <Field label={t.formPassword}>
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label={t.formCompany}>
        {(control) => (
          <Input
            {...control}
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        )}
      </Field>
      <Field label={t.formExpiry}>
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        )}
      </Field>
      <Button
        type="submit"
        iconStart={<Icon name="plus" />}
        disabled={busy || !username || !password || !company}
      >
        {t.formSubmit}
      </Button>
    </form>
  );
}
