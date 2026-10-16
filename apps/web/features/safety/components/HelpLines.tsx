'use client';

import { cx, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import { telHref } from '../phone';

/**
 * 위기 번호 줄 둘(109, 1577-1366). 줄 전체가 tel: 링크다. 번호와 기관 이름은 i18n 의 고정값이다.
 * `lg` 는 /help 의 큰 줄. 모바일에서 "전화하기" 는 원형 아이콘이 된다.
 */
export function HelpLines({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const translations = useTranslations();
  const large = size === 'lg';
  return (
    <ul className={cx('m-0 grid list-none p-0', large ? 'gap-3' : 'gap-2')}>
      {translations.safety.lines.map((line) => (
        <li key={line.number}>
          <a
            href={telHref(line.number)}
            className={cx(
              'flex items-center gap-3 rounded-md border border-crisis-border text-crisis-fg no-underline transition-[transform,box-shadow] duration-(--t-fast) ease-soft hover:-translate-y-px hover:shadow-1 focus-visible:shadow-focus focus-visible:outline-none',
              large ? 'bg-crisis-bg px-[22px] py-5 max-sm:flex-wrap' : 'bg-surface px-3.5 py-3',
            )}
          >
            <span
              className={cx(
                'font-[750] tracking-[.02em] whitespace-nowrap tabular-nums',
                large ? 'text-[28px] max-sm:text-[22px]' : 'text-xl max-sm:text-lg',
              )}
            >
              {line.number}
            </span>
            <span
              className={cx('min-w-0 flex-1 leading-snug', large ? 'text-[15px]' : 'text-[13px]')}
            >
              <b className="font-semibold">{line.name}</b>
              <br />
              <span className="opacity-80">{line.hours}</span>
            </span>
            <span className="ml-auto inline-flex flex-none items-center gap-1.5 text-[13px] font-bold whitespace-nowrap max-sm:size-9 max-sm:justify-center max-sm:rounded-full max-sm:bg-crisis-bg [&_svg]:size-4 max-sm:[&_svg]:size-[18px]">
              <Icon name="phone" />
              <span className="max-sm:sr-only">{translations.safety.call}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
