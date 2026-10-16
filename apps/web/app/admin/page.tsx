'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminStore } from '@/features/admin/admin.store';
import { AccountTable } from '@/features/admin/components/AccountTable';
import { AddAccountForm } from '@/features/admin/components/AddAccountForm';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { LocaleSelect } from '@/i18n/LocaleSelect';

export default function AdminPage() {
  const translations = useTranslations();
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const principal = useAuthStore((s) => s.principal);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);
  const refresh = useAdminStore((s) => s.refresh);
  const error = useAdminStore((s) => s.error);

  useEffect(() => {
    void init();
  }, [init]);

  const isAdmin = principal?.role === 'admin';

  // Gate: send unauthenticated visitors to the login gate, non-admins to their flow.
  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!principal) {
      router.replace('/');
    } else if (!isAdmin) {
      router.replace('/onboarding');
    }
  }, [ready, principal, isAdmin, router]);

  // Load accounts once the admin identity is confirmed.
  useEffect(() => {
    if (isAdmin) {
      void refresh();
    }
  }, [isAdmin, refresh]);

  if (!ready || !isAdmin || !principal) {
    return <main className="px-6 py-24 text-center text-muted">…</main>;
  }

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{translations.admin.title}</h1>
          <p className="text-sm text-muted">{translations.admin.signedInAs(principal.username)}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSelect />
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm"
          >
            {translations.auth.logout}
          </button>
        </div>
      </header>

      <AddAccountForm />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <AccountTable />
    </main>
  );
}
