'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { useAdminStore } from '@/features/admin/admin.store';
import { AdminConsole } from '@/features/admin/components/AdminConsole';
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
    return <main className="flex-1" aria-busy="true" />;
  }

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <main className="mx-auto grid w-full max-w-wide flex-1 content-start gap-8 px-8 py-10 max-sm:px-4 max-sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="m-0 text-h1">{translations.admin.title}</h1>
          <p className="m-0 max-w-[560px] text-fg-muted">{translations.admin.subtitle}</p>
          <p className="m-0 text-small text-fg-muted">
            {translations.admin.signedInAs(principal.username)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LocaleSelect />
          <Button
            variant="secondary"
            size="sm"
            iconStart={<Icon name="logout" />}
            onClick={() => void onLogout()}
          >
            {translations.auth.logout}
          </Button>
        </div>
      </header>

      <AdminConsole />
    </main>
  );
}
