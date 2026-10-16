'use client';

/**
 * Root — the app's sign-in gate.
 * Checks the session (/me) once on entry, then routes by role:
 *   admin  → /admin (account management)
 *   viewer → /sessions (list; redirects first-timers to /onboarding)
 * Unauthenticated visitors see the login form (with branding); while the
 * backend reports first-run setup as pending, the setup form shows instead.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { SetupForm } from '@/features/auth/components/SetupForm';
import { useTranslations } from '@/i18n/I18nProvider';
import { LocaleSelect } from '@/i18n/LocaleSelect';

const HOME_FOR_ROLE: Record<string, string> = {
  admin: '/admin',
  viewer: '/sessions',
};

export default function HomePage() {
  const translations = useTranslations();
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const principal = useAuthStore((s) => s.principal);
  const setupRequired = useAuthStore((s) => s.setupRequired);
  const init = useAuthStore((s) => s.init);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Once signed in, route by role.
  useEffect(() => {
    if (principal) {
      router.replace(HOME_FOR_ROLE[principal.role] ?? '/onboarding');
    }
  }, [principal, router]);

  if (!ready || principal) {
    return <main className="flex flex-1 items-center justify-center px-6 text-muted">…</main>;
  }

  return (
    <main className="relative flex flex-1 items-center justify-center px-6">
      <div className="absolute top-4 right-4">
        <LocaleSelect />
      </div>
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{translations.landing.title}</h1>
          <p className="leading-relaxed text-muted">
            {translations.landing.subtitleLine1}
            <br />
            {translations.landing.subtitleLine2}
          </p>
        </div>

        <div className="flex flex-col items-center space-y-4">
          {setupRequired ? (
            <SetupForm />
          ) : registering ? (
            <RegisterForm onBackToLogin={() => setRegistering(false)} />
          ) : (
            <>
              <LoginForm />
              <button
                type="button"
                onClick={() => setRegistering(true)}
                className="text-sm text-muted underline hover:text-foreground"
              >
                {translations.auth.registerLink}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
