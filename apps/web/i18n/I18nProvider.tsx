'use client';

/**
 * i18n/I18nProvider.tsx — holds the active locale and supplies its catalog.
 * The initial locale comes from the server (read from a cookie in the layout),
 * so the first paint is already in the right language — no flash. Switching at
 * runtime updates state and the cookie, so the next load stays consistent.
 */
import { createContext, type ReactNode, useContext, useState } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { ko } from './ko';
import type { Messages } from './messages';
import { persistLocale } from './persist-locale';
import { getMessages } from './registry';

interface LocaleControls {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleControls>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
});
const MessagesContext = createContext<Messages>(ko);

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (next: Locale): void => {
    setLocaleState(next); // instant UI update
    void persistLocale(next); // save to cookie so the next load renders this locale server-side
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <MessagesContext.Provider value={getMessages(locale)}>{children}</MessagesContext.Provider>
    </LocaleContext.Provider>
  );
}

export const useTranslations = (): Messages => useContext(MessagesContext);
export const useLocale = (): LocaleControls => useContext(LocaleContext);
