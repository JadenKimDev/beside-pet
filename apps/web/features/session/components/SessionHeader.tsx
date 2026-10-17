'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, Journey, journeyProgress } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import type { TaskId } from '@/lib/api';

/**
 * 대화와 다시 보기의 머리: [뒤로] [제목·단계와 네 걸음 디딤돌] [오른쪽 행동].
 * 전역 머리(로고와 도움 알약) 아래에 붙는다. 진행은 서버의 task 로만 그린다(ADR-0005).
 */
export function SessionHeader({
  task,
  petName,
  backHref,
  actions,
}: {
  task: TaskId;
  petName?: string;
  backHref: string;
  actions?: ReactNode;
}) {
  const translations = useTranslations();
  const stage = task > 0 ? translations.taskLabels[task] : translations.session.progressFallback;
  const title = petName ? translations.chat.titleWithStage(petName, stage) : stage;
  const { step } = journeyProgress(task);
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-[12px]">
      <div className="mx-auto flex w-full max-w-read items-center gap-3 px-4 py-3 max-sm:gap-2">
        <Link
          href={backHref}
          aria-label={translations.session.toList}
          className="inline-grid size-10 flex-none place-items-center rounded-full text-fg-muted no-underline transition-colors duration-(--t-fast) hover:bg-bg-sunk hover:text-fg focus-visible:shadow-focus focus-visible:outline-none [&_svg]:size-5"
        >
          <Icon name="chev-left" />
        </Link>
        <Journey
          task={task}
          label={title}
          valueText={translations.chat.progressText(step, stage)}
          className="min-w-0 flex-1"
        />
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
