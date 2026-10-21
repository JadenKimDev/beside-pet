'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { cx, Logo } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import { LocaleSelect } from '@/i18n/LocaleSelect';
import type { HeaderVariant } from './chrome';
import { HelpPill } from './HelpPill';

/**
 * 전역 머리. 높이 64(모바일 56), 오른쪽 끝에 늘 도움 알약.
 * - public: [로고] … [앱 언어] [도움 알약]
 * - app: [로고] [대화] [설정] … [도움 알약]
 * - chat: [start] [center] [end] [도움 알약]. 대화 화면이 뒤로·진행·마치기를 넘긴다. 넘기지 않으면 로고만.
 * 붙을지(`sticky`)는 chrome.ts 가 정한다. 대화 화면의 진행 머리는 이 머리 바로 아래(top 64, 모바일 56)에 붙는다.
 * 좁은 폭(public, app)에서는 로고 글자를 숨겨(읽는 이름은 남긴다) 언어 선택·내비와 도움 알약이 늘 한 줄에 들어간다.
 */
export function SiteHeader({
  variant,
  showLocale = false,
  showHelp = true,
  sticky = true,
  start,
  center,
  end,
}: {
  variant: HeaderVariant;
  showLocale?: boolean;
  /** 도움 알약. 관리자 화면만 끈다(chrome.ts). */
  showHelp?: boolean;
  /** 스크롤돼도 화면 위에 붙을지(chrome.ts 의 stickyHeader). */
  sticky?: boolean;
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}) {
  const translations = useTranslations();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sticky]);

  const brand = (
    <Link
      href="/"
      className="inline-flex flex-none items-center rounded-sm no-underline focus-visible:shadow-focus focus-visible:outline-none max-sm:min-h-11"
    >
      <Logo
        wordmark={translations.landing.title}
        className={variant === 'chat' ? undefined : 'max-sm:[&>span]:sr-only'}
      />
    </Link>
  );

  const navLink = (href: string, label: string) => {
    const current = pathname === href || pathname?.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={cx(
          'inline-flex items-center rounded-pill px-3 py-2 text-sm whitespace-nowrap max-sm:min-h-11 max-sm:px-2.5 no-underline transition-colors duration-(--t-fast) hover:bg-bg-sunk hover:text-fg focus-visible:shadow-focus focus-visible:outline-none',
          current ? 'bg-bg-sunk text-fg' : 'text-fg-muted',
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header
      className={cx(
        'z-20 border-b bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-[12px] transition-[border-color] duration-(--t-base) ease-soft',
        sticky ? 'sticky top-0' : 'relative',
        scrolled || !sticky ? 'border-border' : 'border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-wide items-center gap-4 px-8 max-sm:h-14 max-sm:gap-2 max-sm:px-4">
        {variant === 'chat' ? (start ?? brand) : brand}
        {variant === 'app' && (
          <nav className="flex min-w-0 items-center gap-1 max-sm:gap-0.5">
            {navLink('/sessions', translations.nav.conversations)}
            {navLink('/settings', translations.nav.settings)}
          </nav>
        )}
        {variant === 'chat' && center && <div className="min-w-0 flex-1">{center}</div>}
        <span className="flex-1" />
        {variant === 'chat' && end}
        {variant === 'public' && showLocale && <LocaleSelect fill={false} />}
        {showHelp && <HelpPill />}
      </div>
    </header>
  );
}
