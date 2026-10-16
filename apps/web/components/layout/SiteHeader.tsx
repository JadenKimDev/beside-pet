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
 *   대화 화면은 아직 자기 머리를 sticky 로 가지므로 chat 머리는 붙지 않는다.
 */
export function SiteHeader({
  variant,
  showLocale = false,
  start,
  center,
  end,
}: {
  variant: HeaderVariant;
  showLocale?: boolean;
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}) {
  const translations = useTranslations();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const sticky = variant !== 'chat';

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
      className="flex-none rounded-sm no-underline focus-visible:shadow-focus focus-visible:outline-none"
    >
      <Logo wordmark={translations.landing.title} />
    </Link>
  );

  const navLink = (href: string, label: string) => {
    const current = pathname === href || pathname?.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={cx(
          'rounded-pill px-3 py-2 text-sm no-underline transition-colors duration-(--t-fast) hover:bg-bg-sunk hover:text-fg focus-visible:shadow-focus focus-visible:outline-none',
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
          <nav className="flex items-center gap-1">
            {navLink('/sessions', translations.nav.conversations)}
            {navLink('/settings', translations.nav.settings)}
          </nav>
        )}
        {variant === 'chat' && center && <div className="min-w-0 flex-1">{center}</div>}
        <span className="flex-1" />
        {variant === 'chat' && end}
        {variant === 'public' && showLocale && <LocaleSelect />}
        <HelpPill />
      </div>
    </header>
  );
}
