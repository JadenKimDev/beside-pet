/**
 * i18n/config.ts — locale configuration.
 * Korean is the default; add a locale by adding a catalog (see registry.ts).
 * Adding a language = 3 edits: a new `i18n/<loc>.ts` catalog, a `LOCALES`/
 * `LOCALE_LABELS` entry here, and a `registry.ts` mapping. Everything else
 * (onboarding language chips, the picker) derives from `LOCALES`.
 */

export const LOCALES = ['ko', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ko';

/** Language names shown in their own language (endonyms), for the switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
};

/** Cookie that stores the chosen locale; read on the server so the first paint
 * already renders the right language (no flash). */
export const LOCALE_COOKIE = 'beside-pet.locale';

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

/** Normalize an arbitrary cookie value to a known locale (falls back to default). */
export const resolveLocale = (value: string | undefined): Locale =>
  value && isLocale(value) ? value : DEFAULT_LOCALE;

/**
 * Pick a supported locale from an Accept-Language header (e.g. "en-US,en;q=0.9,ko;q=0.8").
 * Used for the very first paint when no locale cookie exists yet — so a visitor
 * (incl. non-Korean speakers) sees the login screen in their browser language.
 * Falls back to the default when nothing matches.
 */
export const resolveAcceptLanguage = (header: string | undefined): Locale => {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    const base = tag.split('-')[0] ?? '';
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
};
