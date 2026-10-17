'use client';

/**
 * LocaleSelect — app UI language switcher (the locale cookie), as a segmented
 * control. Used on the settings page and in the public header. Distinct from
 * ChatLanguageSelect, which sets the account-level language the companion
 * replies in.
 */
import { Segmented } from '@/components/ui';
import { LOCALE_LABELS, LOCALES } from './config';
import { useLocale, useTranslations } from './I18nProvider';

export function LocaleSelect() {
  const translations = useTranslations();
  const { locale, setLocale } = useLocale();

  return (
    <Segmented
      label={translations.settings.uiLanguage}
      value={locale}
      onChange={setLocale}
      options={LOCALES.map((candidate) => ({ value: candidate, label: LOCALE_LABELS[candidate] }))}
    />
  );
}
