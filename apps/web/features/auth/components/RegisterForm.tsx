'use client';

/**
 * RegisterForm — public account application (username / password / company).
 * Creates a pending account; sign-in becomes possible after admin approval.
 * View + local input only; the use case lives in auth.store. The page owns the
 * login/register mode switch and passes it down as onBackToLogin.
 */
import { type FormEvent, useState } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';

export function RegisterForm({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useTranslations().auth;
  const register = useAuthStore((s) => s.register);
  const resetRegistered = useAuthStore((s) => s.resetRegistered);
  const registered = useAuthStore((s) => s.registered);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void register(username.trim(), password, company.trim());
  };

  const backToLogin = () => {
    resetRegistered();
    onBackToLogin();
  };

  if (registered) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-surface p-6 text-center">
        <p className="leading-relaxed text-sm">{t.registerDone}</p>
        <button
          type="button"
          onClick={backToLogin}
          className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {t.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-surface p-6"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t.registerTitle}</h1>
        <p className="text-sm text-muted">{t.registerSubtitle}</p>
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
          autoComplete="new-password"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-muted">{t.company}</span>
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !username.trim() || password.length < 8 || !company.trim()}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t.registering : t.registerSubmit}
      </button>
    </form>
  );
}
