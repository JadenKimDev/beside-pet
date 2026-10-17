'use client';

/** RegisterDone — 신청 완료: 체크 원, 안내, 도움받을 곳 링크, 로그인으로. */
import Link from 'next/link';
import { Button, buttonClass, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

export function RegisterDone({ onBackToLogin }: { onBackToLogin: () => void }) {
  const translations = useTranslations();
  const t = translations.auth;
  return (
    <div className="text-center" role="status">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-[26px]">
        <Icon name="check" />
      </div>
      <h2 className="m-0 text-h2 font-bold">{t.registerDoneTitle}</h2>
      <p className="mt-1.5 mb-6 text-sm text-fg-muted">{t.registerDone}</p>
      <div className="grid gap-3">
        <Link href="/help" className={buttonClass({ variant: 'secondary', block: true })}>
          <Icon name="lifebuoy" />
          {translations.crisis.toHelp}
        </Link>
        <Button variant="ghost" block onClick={onBackToLogin}>
          {t.backToLogin}
        </Button>
      </div>
    </div>
  );
}
