'use client';

/**
 * /settings — the viewer's preferences and account actions.
 * Conversation language (account-level, applies from the next reply), the app
 * UI language (locale cookie), and signing out — this is the viewer's only
 * route to it, so the chat itself stays free of account chrome.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { ChatLanguageSelect } from '@/features/auth/components/ChatLanguageSelect';
import { useSessionStore } from '@/features/session/session.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { LocaleSelect } from '@/i18n/LocaleSelect';

export default function SettingsPage() {
  const translations = useTranslations();
  const router = useRouter();
  const principal = useAuthStore((state) => state.principal);
  const logout = useAuthStore((state) => state.logout);
  const init = useAuthStore((state) => state.init);
  const resetSession = useSessionStore((state) => state.reset);

  // Landing here directly (not via the app shell) starts with an empty store.
  useEffect(() => {
    void init();
  }, [init]);

  const onLogout = async () => {
    await logout();
    // Drop the in-memory conversation so the next account starts clean.
    resetSession();
    router.replace('/');
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <header className="space-y-3">
        <Link href="/sessions" className="text-sm text-muted underline hover:text-foreground">
          ← {translations.settings.back}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{translations.settings.title}</h1>
      </header>

      <section className="mt-6 space-y-4">
        <div className="space-y-2 rounded-xl border border-black/5 bg-surface px-4 py-4">
          <ChatLanguageSelect />
          <p className="text-xs text-muted">{translations.settings.chatLanguageHint}</p>
        </div>

        <div className="rounded-xl border border-black/5 bg-surface px-4 py-4">
          <LocaleSelect />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-black/5 bg-surface px-4 py-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{translations.settings.account}</p>
            {principal && (
              <p className="text-xs text-muted">
                {translations.settings.signedInAs(principal.username)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm transition-colors hover:bg-black/5"
          >
            {translations.auth.logout}
          </button>
        </div>
      </section>
    </main>
  );
}
