import type { Metadata } from 'next';
import { Gowun_Batang } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveAcceptLanguage, resolveLocale } from '@/i18n/config';
import { I18nProvider } from '@/i18n/I18nProvider';
import { resolveTheme, THEME_COOKIE } from '@/theme/config';
// Body face: Pretendard Variable, self-hosted from the npm package as its
// dynamic subset (only the unicode-range slices a page uses are fetched).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

// Headings and quotes. The Korean subset is large, so it is not preloaded.
const gowunBatang = Gowun_Batang({
  variable: '--font-gowun-batang',
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Beside Pet',
  description: 'An AI companion for those who have lost a pet.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the saved locale and theme on the server so the first paint renders
  // them (no flash). No locale cookie yet (first visit) → fall back to the
  // browser's Accept-Language. No or unknown theme cookie → hanji.
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = savedLocale
    ? resolveLocale(savedLocale)
    : resolveAcceptLanguage((await headers()).get('accept-language') ?? undefined);
  const theme = resolveTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={initialLocale}
      data-theme={theme}
      className={`${gowunBatang.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
