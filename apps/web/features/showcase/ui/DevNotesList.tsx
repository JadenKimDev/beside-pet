'use client';

import { Badge } from '@/components/ui';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { DevNote } from '../model/types';

/**
 * 개발 기록. 받은 순서(이미 최근 날짜부터)대로 종류, 날짜, 제목, 설명을 보인다.
 * 이슈 번호와 저장소 링크는 쓰는 사람에게 뜻이 없어 보이지 않는다(ADR-0029).
 */
export function DevNotesList({ notes }: { notes: readonly DevNote[] }) {
  const translations = useTranslations();
  const { locale } = useLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <ol className="m-0 mt-6 grid list-none gap-0 p-0">
      {notes.map((note) => (
        <li
          key={`${note.date}-${note.kind}-${note.title}`}
          className="border-t border-border py-5 first:border-t-0 first:pt-0"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={note.kind === 'planned' ? 'live' : 'default'}>
              {translations.showcase.noteKind[note.kind]}
            </Badge>
            <time dateTime={note.date} className="text-small text-fg-muted">
              {dateFormat.format(new Date(`${note.date}T00:00:00Z`))}
            </time>
          </div>
          <h3 className="m-0 mt-2.5 text-h3 font-semibold text-fg">{note.title}</h3>
          <p className="m-0 mt-1.5 text-fg-muted">{note.body}</p>
        </li>
      ))}
    </ol>
  );
}
