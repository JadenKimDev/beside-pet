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

/** `fill={false}` 는 머리처럼 좁은 줄 안에서 쓴다(칸을 늘리지 않고 글자를 한 줄로 둔다). */
export function LocaleSelect({ fill = true }: { fill?: boolean }) {
  const translations = useTranslations();
  const { locale, setLocale } = useLocale();

  return (
    <Segmented
      label={translations.settings.uiLanguage}
      value={locale}
      onChange={setLocale}
      fill={fill}
      options={LOCALES.map((candidate) => ({ value: candidate, label: LOCALE_LABELS[candidate] }))}
    />
  );
}
