'use server';

/**
 * i18n/persist-locale.ts — server action that stores the chosen locale in a
 * cookie. Using the server-side cookies() API (not document.cookie) is the
 * idiomatic App Router way and lets the layout read it on the next load.
 */
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function persistLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  });
}
