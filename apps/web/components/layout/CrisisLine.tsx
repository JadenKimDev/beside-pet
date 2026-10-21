'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { cx } from '@/components/ui';
import { splitByNumbers, telHref } from '@/features/safety/phone';
import { useTranslations } from '@/i18n/I18nProvider';

/**
 * 위기 띠: 두 번호가 tel: 링크인 한 문장. 바닥(`SiteFooter`)과 대화 화면의 입력창 아래(`compact`)가 함께 쓴다.
 * 번호 링크는 모양을 바꾸지 않고 패딩으로만 누르는 자리를 44px 로 넓힌다(인라인이라 줄 높이는 그대로다).
 * `compact` 는 입력창 아래 한 줄용이라 "더 보기" 링크를 두지 않는다(머리의 도움 알약이 같은 곳으로 간다).
 */
export function CrisisLine({ compact = false }: { compact?: boolean }) {
  const translations = useTranslations();
  const numbers = translations.safety.lines.map((line) => line.number);
  const pieces = splitByNumbers(translations.footer.crisis, numbers);
  return (
    <p
      className={cx(
        'm-0 rounded-md border border-crisis-border bg-crisis-bg leading-relaxed text-crisis-fg',
        compact ? 'mt-2 px-3 py-1.5 text-xs' : 'px-4 py-3',
      )}
    >
      {pieces.map((piece, index) =>
        piece.number ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: 조각의 순서가 곧 이름이다.
            key={index}
            href={telHref(piece.number)}
            className="-mx-3 px-3 py-4 font-bold whitespace-nowrap text-crisis-fg underline underline-offset-[3px]"
          >
            {piece.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 조각의 순서가 곧 이름이다.
          <Fragment key={index}>{piece.text}</Fragment>
        ),
      )}
      {!compact && (
        <>
          {' '}
          <Link
            href="/help"
            className="py-4 font-semibold text-crisis-fg underline underline-offset-[3px]"
          >
            {translations.footer.more}
          </Link>
        </>
      )}
    </p>
  );
}
