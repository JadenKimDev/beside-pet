'use client';

/**
 * /settings — the viewer's preferences and account actions, as reading-width card
 * groups. "Conversation": the conversation language (account-level, applies from the
 * next reply), the app language (locale cookie) and the colour theme (theme cookie);
 * the two languages sit side by side in the same shape, told apart by their hints
 * (ADR-0002). "Account": who is signed in and signing out — the viewer's only route
 * to it. "Help": the public /help page.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { ChatLanguageSelect } from '@/features/auth/components/ChatLanguageSelect';
import { useSessionStore } from '@/features/session/session.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { LocaleSelect } from '@/i18n/LocaleSelect';
import { ThemeSelect } from './ThemeSelect';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="m-0 text-eyebrow font-semibold text-fg-muted uppercase">{title}</h2>
      <div className="grid divide-y divide-border rounded-lg border border-border bg-surface shadow-1">
        {children}
      </div>
    </section>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 px-6 py-5 max-sm:px-4">
      <div className="grid gap-1">
        <h3 className="m-0 text-body font-semibold">{title}</h3>
        {hint && <p className="m-0 text-small text-fg-muted">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const translations = useTranslations();
  const t = translations.settings;
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
    <main className="mx-auto grid w-full max-w-read flex-1 content-start gap-8 px-4 py-10 max-sm:py-6">
      <header className="grid gap-3">
        <Link
          href="/sessions"
          className="inline-flex w-fit items-center gap-1 text-small text-fg-muted no-underline hover:text-fg [&_svg]:size-4"
        >
          <Icon name="chev-left" />
          {t.back}
        </Link>
        <h1 className="m-0 text-h1">{t.title}</h1>
      </header>

      <Group title={t.groupChat}>
        <Row title={translations.auth.chatLanguage} hint={t.chatLanguageHint}>
          <ChatLanguageSelect />
        </Row>
        <Row title={t.uiLanguage} hint={t.uiLanguageHint}>
          <LocaleSelect />
        </Row>
        <Row title={t.theme} hint={t.themeHint}>
          <ThemeSelect />
        </Row>
      </Group>

      <Group title={t.groupAccount}>
        <div className="flex items-center justify-between gap-4 px-6 py-5 max-sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-5">
              <Icon name="user" />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <p className="m-0 truncate font-semibold">{principal?.username ?? '—'}</p>
              {principal && <p className="m-0 text-small text-fg-muted">{t.signedIn}</p>}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconStart={<Icon name="logout" />}
            onClick={() => void onLogout()}
          >
            {translations.auth.logout}
          </Button>
        </div>
      </Group>

      <Group title={t.groupHelp}>
        <Link
          href="/help"
          className="flex items-center justify-between gap-4 px-6 py-5 text-fg no-underline hover:bg-bg-sunk max-sm:px-4 [&_svg]:size-5"
        >
          <span className="inline-flex items-center gap-3 font-semibold">
            <Icon name="lifebuoy" className="text-crisis-ink" />
            {t.helpLink}
          </span>
          <Icon name="chev-right" className="text-fg-muted" />
        </Link>
      </Group>
    </main>
  );
}
