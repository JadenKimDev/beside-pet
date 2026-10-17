'use client';

import Link from 'next/link';
import { buttonClass, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

/** 위기 카드가 붙은 뒤 컴포저 자리(§6.10): 멈춤 안내 + [대화 목록] [도움받을 수 있는 곳]. */
export function CrisisStopped() {
  const translations = useTranslations();
  return (
    <section className="sticky bottom-0 z-10 mx-auto grid w-full max-w-read gap-3 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_28px)] px-4 pt-7 pb-6 text-center">
      <p className="m-0 text-small text-fg-muted">{translations.crisis.stopped}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/sessions" className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {translations.crisis.toList}
        </Link>
        <Link href="/help" className={buttonClass({ variant: 'primary', size: 'md' })}>
          <Icon name="phone" />
          {translations.crisis.toHelp}
        </Link>
      </div>
    </section>
  );
}
