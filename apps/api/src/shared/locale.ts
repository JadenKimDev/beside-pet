/**
 * locale.ts — conversation language. Kept 1:1 with the Locale in the frontend's i18n/config.ts.
 * Static server data is English-only; the model renders utterances in the session's language.
 */
export const LOCALES = ['ko', 'en'] as const;

export type Locale = (typeof LOCALES)[number];
