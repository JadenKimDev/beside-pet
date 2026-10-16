'use client';

/**
 * /sessions/[id]/report — the mind report of one wrapped-up session.
 * Available only when the session carried enough of the journey; otherwise a
 * gentle notice explains why. Loading lives in session-archive.store.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useSessionArchiveStore } from '@/features/session-archive/session-archive.store';
import { useTranslations } from '@/i18n/I18nProvider';

export default function SessionReportPage() {
  const labels = useTranslations();
  const translations = labels.sessionDetail;
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const loadReport = useSessionArchiveStore((state) => state.loadReport);
  const status = useSessionArchiveStore((state) => state.reportStatus);
  const loadedId = useSessionArchiveStore((state) => state.reportId);
  const report = useSessionArchiveStore((state) => state.report);
  const session = useSessionArchiveStore((state) => state.detail);

  useEffect(() => {
    void loadReport(sessionId);
  }, [sessionId, loadReport]);

  // While navigating between sessions the slot still holds the previous one.
  const current = loadedId === sessionId;
  const progress = current && session ? Math.round(session.progress * 100) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <header className="space-y-3">
        <Link href="/sessions" className="text-sm text-muted underline hover:text-foreground">
          ← {translations.back}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">{translations.reportTitle}</h1>
          {progress !== undefined && <p className="text-xs text-muted">{progress}%</p>}
        </div>
      </header>

      <section className="mt-6 space-y-3">
        {(!current || status === 'loading' || status === 'idle') && (
          <p className="text-sm text-muted">{translations.reportLoading}</p>
        )}
        {current && status === 'unavailable' && (
          <p className="text-sm leading-relaxed text-muted">{translations.reportNotReady}</p>
        )}
        {current && status === 'failed' && (
          <p className="text-sm text-muted">{translations.reportFailed}</p>
        )}
        {current &&
          status === 'ready' &&
          report?.sections.map((section) => (
            <article
              key={section.key}
              className="space-y-1 rounded-xl border border-black/5 bg-surface px-4 py-3"
            >
              <h3 className="text-sm font-medium text-accent">
                {labels.reportSections[section.key]}
              </h3>
              <p className="text-[15px] leading-relaxed">{section.body}</p>
            </article>
          ))}
      </section>
    </main>
  );
}
