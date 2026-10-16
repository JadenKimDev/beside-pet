'use client';

/**
 * LocaleSelect — app UI language switcher (the locale cookie).
 * Shared by the viewer's settings page and the admin console, so both surfaces
 * switch language the same way. Distinct from ChatLanguageSelect, which sets
 * the account-level language the companion replies in.
 */
import { isLocale, LOCALE_LABELS, LOCALES } from './config';
import { useLocale, useTranslations } from './I18nProvider';

export function LocaleSelect() {
  const translations = useTranslations();
  const { locale, setLocale } = useLocale();

  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
      <span>{translations.settings.uiLanguage}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            setLocale(event.target.value);
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
