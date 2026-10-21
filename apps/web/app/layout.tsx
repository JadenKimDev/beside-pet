import type { Metadata, Viewport } from 'next';
import { Gowun_Batang } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { SiteChrome } from '@/components/layout/SiteChrome';
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

// viewport-fit=cover 로 노치 아래까지 그리고(바닥 여백은 safe-area 로 띄운다), 휴대폰 키보드가 올라오면
// 레이아웃 뷰포트가 줄게 해(resizes-content) 대화 화면의 100dvh 와 붙은 입력창이 키보드 위에 남게 한다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
        <I18nProvider initialLocale={initialLocale}>
          <SiteChrome>{children}</SiteChrome>
        </I18nProvider>
      </body>
    </html>
  );
}
