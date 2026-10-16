'use client';

import { useTranslations } from '@/i18n/I18nProvider';
import type { TaskId } from '@/lib/api';

/** Top progress bar — current task + progress (0..1) from TurnResult. */
export function ProgressBar({ task, progress }: { task: TaskId; progress: number }) {
  const translations = useTranslations();
  const percent = Math.round(progress * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {task > 0 ? translations.taskLabels[task] : translations.session.progressFallback}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
