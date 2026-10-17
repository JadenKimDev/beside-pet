'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { splitByNumbers, telHref } from '@/features/safety/phone';
import { useTranslations } from '@/i18n/I18nProvider';

/**
 * 전역 바닥: 위기 띠(두 번호는 tel: 링크, 도움받을 수 있는 곳 더 보기) + 면책(ADR-0003 의 부정형 예외) + ©.
 * 위기 띠는 제품 사용자의 어느 화면에서도 빼지 않는다. 관리자 화면만 끈다(chrome.ts 의 crisis).
 */
export function SiteFooter({ showCrisis = true }: { showCrisis?: boolean }) {
  const translations = useTranslations();
  const numbers = translations.safety.lines.map((line) => line.number);
  const pieces = splitByNumbers(translations.footer.crisis, numbers);
  return (
    <footer className="mt-auto border-t border-border pt-8 pb-12 text-[13px] text-fg-muted">
      <div
        className={
          showCrisis
            ? 'mx-auto grid w-full max-w-wide grid-cols-[1.4fr_1fr] items-start gap-4 px-8 max-sm:grid-cols-1 max-sm:px-4'
            : 'mx-auto grid w-full max-w-wide grid-cols-1 items-start gap-4 px-8 max-sm:px-4'
        }
      >
        {showCrisis && (
          <p className="m-0 rounded-md border border-crisis-border bg-crisis-bg px-4 py-3 leading-relaxed text-crisis-fg">
            {pieces.map((piece, index) =>
              piece.number ? (
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: 조각의 순서가 곧 이름이다.
                  key={index}
                  href={telHref(piece.number)}
                  className="font-bold whitespace-nowrap text-crisis-fg underline underline-offset-[3px]"
                >
                  {piece.text}
                </a>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: 조각의 순서가 곧 이름이다.
                <Fragment key={index}>{piece.text}</Fragment>
              ),
            )}{' '}
            <Link
              href="/help"
              className="font-semibold text-crisis-fg underline underline-offset-[3px]"
            >
              {translations.footer.more}
            </Link>
          </p>
        )}
        <div className="leading-relaxed">
          <p className="m-0">{translations.footer.disclaimer}</p>
          <p className="m-0 mt-1 text-caption">
            © {new Date().getFullYear()} {translations.landing.title}
          </p>
        </div>
      </div>
    </footer>
  );
}
