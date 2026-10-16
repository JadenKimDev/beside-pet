'use client';

/**
 * SetupForm — first-run admin bootstrap (shown instead of LoginForm while the
 * backend reports setup as pending). The operator pastes the one-time token
 * from the server boot log and picks the admin credentials; nothing lives in
 * env files. View + local input only; the use case lives in auth.store.
 */
import { type FormEvent, useState } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';

export function SetupForm() {
  const translations = useTranslations();
  const t = translations.auth;
  const setup = useAuthStore((s) => s.setup);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void setup(token.trim(), username.trim(), password);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-surface p-6"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t.setupTitle}</h1>
        <p className="text-sm text-muted">{t.setupSubtitle}</p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm text-muted">{t.setupToken}</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">{t.setupTokenHint}</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-muted">{t.username}</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-muted">{t.password}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !token.trim() || !username.trim() || !password}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t.settingUp : t.setupSubmit}
      </button>
    </form>
  );
}
