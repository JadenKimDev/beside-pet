'use client';

/**
 * ChatLanguageSelect — account-level conversation language control.
 * Independent of the app UI locale: changing it only affects what language the
 * companion replies in, starting from the next turn. View only; the use case
 * lives in auth.store.
 */
import { useAuthStore } from '@/features/auth/auth.store';
import { isLocale, LOCALE_LABELS, LOCALES } from '@/i18n/config';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';

export function ChatLanguageSelect() {
  const t = useTranslations().auth;
  const { locale } = useLocale();
  const principal = useAuthStore((s) => s.principal);
  const setChatLanguage = useAuthStore((s) => s.setChatLanguage);
  const value = principal?.chatLanguage ?? locale;

  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
      <span>{t.chatLanguage}</span>
      <select
        value={value}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            void setChatLanguage(event.target.value);
          }
        }}
        className="rounded-md border border-black/15 bg-background px-2 py-1 outline-none focus:border-accent"
      >
        {LOCALES.map((candidate) => (
          <option key={candidate} value={candidate}>
            {LOCALE_LABELS[candidate]}
          </option>
        ))}
      </select>
    </label>
  );
}
