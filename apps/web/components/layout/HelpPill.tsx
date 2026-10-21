'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

/** 늘 보이는 도움 알약. 숨기지 않고 인증 뒤에 두지 않는다. /help 로 간다. 모바일은 짧은 문구. */
export function HelpPill() {
  const translations = useTranslations();
  const here = usePathname() === '/help';
  return (
    <Link
      href="/help"
      aria-current={here ? 'page' : undefined}
      className="inline-flex flex-none items-center gap-1.5 rounded-pill border border-crisis-border bg-crisis-bg px-3 py-1.5 text-[13px] max-sm:min-h-11 font-semibold whitespace-nowrap text-crisis-fg no-underline transition-[transform,box-shadow] duration-(--t-fast) ease-soft hover:-translate-y-px hover:shadow-1 focus-visible:shadow-focus focus-visible:outline-none [&_svg]:size-3.5"
    >
      <Icon name="phone" />
      <span className="max-sm:hidden">{translations.help.pill}</span>
      <span className="sm:hidden">{translations.help.pillShort}</span>
    </Link>
  );
}
