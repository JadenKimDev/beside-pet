'use server';

/**
 * theme/persist-theme.ts — server action that stores the chosen theme in a
 * cookie, the same way i18n/persist-locale.ts stores the locale. The layout
 * reads it on the next render.
 */
import { cookies } from 'next/headers';
import { THEME_COOKIE, type Theme } from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function persistTheme(theme: Theme): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  });
}
