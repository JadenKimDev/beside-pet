'use client';

import { useTranslations } from '@/i18n/I18nProvider';

/**
 * Crisis resources — shown when supportLevel is 3. Always free, never behind a
 * paywall. (Verify hotline numbers before any real deployment.)
 */
export function CrisisResources() {
  const translations = useTranslations();
  return (
    <div className="mx-4 mb-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">{translations.safety.title}</p>
      <p className="mt-1 leading-relaxed">{translations.safety.body}</p>
    </div>
  );
}
