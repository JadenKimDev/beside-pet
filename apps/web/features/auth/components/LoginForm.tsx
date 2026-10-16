'use client';

/**
 * LoginForm — shared username/password sign-in (public gate + admin).
 * View + local input only; the use case lives in auth.store. Routing on success
 * is the page's concern (it reacts to the resulting principal).
 */
import { type FormEvent, useState } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';

export function LoginForm() {
  const translations = useTranslations();
  const t = translations.auth;
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void login(username.trim(), password);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-surface p-6"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-sm text-muted">{t.subtitle}</p>
      </div>
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
          autoComplete="current-password"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !username.trim() || !password}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t.signingIn : t.submit}
      </button>
    </form>
  );
}
