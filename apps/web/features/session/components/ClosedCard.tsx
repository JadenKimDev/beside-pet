'use client';

import Link from 'next/link';
import { buttonClass, Card, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

/** 마친 뒤 카드: "오늘 대화를 마쳤어요" + [마음 리포트 보기](열 수 있을 때만) [대화 목록]. */
export function ClosedCard({
  sessionId,
  reportAvailable,
}: {
  sessionId?: string;
  reportAvailable: boolean;
}) {
  const translations = useTranslations();
  return (
    <Card variant="sunk" as="section" className="ui-rise mt-4 grid gap-3 text-center">
      <h2 className="m-0 text-h3">{translations.chat.closedTitle}</h2>
      <p className="m-0 text-small text-fg-muted">{translations.chat.closedBody}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {reportAvailable && sessionId && (
          <Link
            href={`/sessions/${sessionId}/report`}
            className={buttonClass({ variant: 'primary', size: 'md' })}
          >
            <Icon name="book" />
            {translations.chat.openReport}
          </Link>
        )}
        <Link href="/sessions" className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {translations.session.toList}
        </Link>
      </div>
    </Card>
  );
}
