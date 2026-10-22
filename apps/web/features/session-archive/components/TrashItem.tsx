'use client';

import { Badge, Button, Icon } from '@/components/ui';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { DeletedSessionItem } from '@/lib/api';
import { dateBox, monthDay, weekdayTime } from '../list-dates';
import { daysUntilPurge } from './trash-days';

/**
 * 보관함의 대화 한 줄. 지난 대화 항목(PastSessionItem)과 같은 틀: 날짜 상자(대화를 시작한 날),
 * "○월 ○일에 지웠어요", 보조 줄(요일·시각, 아이 이름), 남은 날수 배지, [되살리기].
 */
export function TrashItem({
  item,
  restoring,
  disabled,
  onRestore,
}: {
  item: DeletedSessionItem;
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const box = dateBox(item.startedAt, locale);
  const days = daysUntilPurge(item.purgeAt, new Date());
  const sub = [weekdayTime(item.startedAt, locale), item.petName].filter(Boolean).join(' · ');

  return (
    <li
      data-trash-session={item.sessionId}
      className="grid grid-cols-[72px_1fr_auto] items-center gap-5 rounded-lg border border-border bg-surface px-5 py-[18px] shadow-1 max-sm:grid-cols-[56px_1fr] max-sm:gap-3.5 max-sm:p-4"
    >
      <div className="rounded-md bg-bg-sunk py-2 text-center">
        <b className="block font-serif text-[26px] leading-[1.1] max-sm:text-[22px]">{box.day}</b>
        <span className="text-xs text-fg-muted">{box.month}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-base">{t.sessionTrash.deletedOn(monthDay(item.deletedAt, locale))}</b>
          <Badge tone={days === 0 ? 'warn' : 'default'}>
            {days === 0 ? t.sessionTrash.lastDay : t.sessionTrash.daysLeft(days)}
          </Badge>
        </div>
        {sub && <div className="mt-1 text-[13px] text-fg-muted">{sub}</div>}
      </div>
      <div className="flex items-center max-sm:col-span-full max-sm:[&>button]:w-full">
        <Button
          variant="secondary"
          size="sm"
          busy={restoring}
          disabled={disabled}
          iconStart={<Icon name="refresh" />}
          onClick={onRestore}
        >
          {t.sessionTrash.restore}
        </Button>
      </div>
    </li>
  );
}
