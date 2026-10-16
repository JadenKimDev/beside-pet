import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveAcceptLanguage, resolveLocale } from '@/i18n/config';
import { I18nProvider } from '@/i18n/I18nProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
  // Read the saved locale on the server so the first paint renders it (no flash).
  // No cookie yet (first visit) → fall back to the browser's Accept-Language, so
  // non-Korean visitors see the login screen in their language before they choose.
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = savedLocale
    ? resolveLocale(savedLocale)
    : resolveAcceptLanguage((await headers()).get('accept-language') ?? undefined);

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
