'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useComposerHeight } from '@/components/chat/composer-height';
import { buttonClass, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

/**
 * 위기 카드가 붙은 뒤 컴포저 자리(§6.10): 멈춤 안내 + [대화 목록] [도움받을 수 있는 곳].
 * 입력창처럼 바닥에 붙으므로 자기 높이를 `--composer-height` 로 알려, 목록의 끝(위기 카드의 번호 줄)이
 * 이 안내 위에서 멈추게 한다.
 */
export function CrisisStopped() {
  const translations = useTranslations();
  const ref = useRef<HTMLElement>(null);
  useComposerHeight(ref);
  return (
    <section
      ref={ref}
      data-crisis-stopped
      className="sticky bottom-0 z-10 mx-auto grid w-full max-w-read gap-3 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_28px)] px-4 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center max-sm:gap-2 max-sm:pt-5 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
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
