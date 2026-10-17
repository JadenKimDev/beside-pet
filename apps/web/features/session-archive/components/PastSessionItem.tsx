'use client';

import Link from 'next/link';
import { Badge, Button, buttonClass, Icon, Journey, journeyProgress, Menu } from '@/components/ui';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { SessionListItem } from '@/lib/api';
import { dateBox, weekdayTime } from '../list-dates';

/**
 * 지난 대화 한 줄: 날짜 상자, "도달한 단계 + 까지", 보조 줄, 작은 디딤돌, [다시 보기] [마음 리포트] […].
 * 삭제는 더보기 메뉴 안에만 둔다. 마음 리포트는 열 수 없으면 이유를 툴팁으로 단 비활성 버튼이다(ADR-0008).
 * 보조 줄의 대화 시간과 메시지 수는 메시지가 없는 대화(서버가 시간 칸을 주지 않는다)면 뺀다.
 */
export function PastSessionItem({
  item,
  onView,
  onDelete,
}: {
  item: SessionListItem;
  onView: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const box = dateBox(item.startedAt, locale);
  const stage = t.taskLabels[item.reachedTask];
  const stats =
    item.durationMinutes !== undefined && item.messageCount > 0
      ? t.sessionList.itemStats(item.durationMinutes, item.messageCount)
      : undefined;
  const sub = [weekdayTime(item.startedAt, locale), item.petName, stats]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      data-past-session={item.sessionId}
      className="grid grid-cols-[72px_1fr_auto] items-center gap-5 rounded-lg border border-border bg-surface px-5 py-[18px] shadow-1 max-sm:grid-cols-[56px_1fr] max-sm:gap-3.5 max-sm:p-4"
    >
      <div className="rounded-md bg-bg-sunk py-2 text-center">
        <b className="block font-serif text-[26px] leading-[1.1] max-sm:text-[22px]">{box.day}</b>
        <span className="text-xs text-fg-muted">{box.month}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-base">{t.sessionList.reachedUntil(stage)}</b>
          <Badge>{item.closed ? t.sessionList.done : t.sessionList.ongoing}</Badge>
        </div>
        <div data-past-meta className="mt-1 text-[13px] text-fg-muted">
          {sub}
        </div>
        <Journey
          compact
          task={item.reachedTask}
          valueText={`${t.sessionList.stepOf(journeyProgress(item.reachedTask).step)}, ${stage}`}
          className="mt-2.5"
        />
      </div>
      <div className="flex items-center gap-1.5 max-sm:col-span-full max-sm:[&>a]:flex-1 max-sm:[&>span:not(:last-child)]:flex-1">
        <Link
          href={`/sessions/${item.sessionId}`}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          <Icon name="chat" />
          {t.sessionList.viewTranscript}
        </Link>
        {item.reportAvailable ? (
          <Link
            href={`/sessions/${item.sessionId}/report`}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <Icon name="book" />
            {t.sessionList.viewReport}
          </Link>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled
            className="max-sm:w-full"
            disabledReason={t.sessionList.reportLocked}
            iconStart={<Icon name="book" />}
          >
            {t.sessionList.viewReport}
          </Button>
        )}
        <Menu
          label={t.sessionList.more}
          icon={<Icon name="more" />}
          items={[
            { label: t.sessionList.menuView, icon: <Icon name="chat" />, onSelect: onView },
            {
              label: t.sessionList.deleteConversation,
              icon: <Icon name="trash" />,
              tone: 'danger',
              onSelect: onDelete,
            },
          ]}
        />
      </div>
    </li>
  );
}
