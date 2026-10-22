import Link from 'next/link';
import type { PublishPrdData } from '@/features/publish-prd';
import { Alert, Badge } from '@/shared/ui';
import { publishStepLabel, STEP_STATUS_LABELS, STEP_STATUS_TONES } from '../model/steps';
import { PRD_COMPOSER_TEXT as T } from '../model/texts';

export type PublishLogProps = {
  publish: PublishPrdData;
  backHref: string;
};

/** 올리기 다섯 단계의 로그. 실패한 단계는 출력을 펼친다. */
export function PublishLog({ publish, backHref }: PublishLogProps) {
  if (publish.status === 'idle') return null;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="text-sm font-semibold text-fg">{T.publishTitle}</h3>
      {publish.error && <Alert tone="danger">{publish.error}</Alert>}
      <ol className="flex flex-col gap-2">
        {publish.steps.map((log, index) => (
          <li key={log.step} className="min-w-0">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={log.status === 'pending' ? 'text-fg-muted' : 'text-fg'}>
                {index + 1}. {publishStepLabel(log.step)}
              </span>
              <Badge tone={STEP_STATUS_TONES[log.status]}>{STEP_STATUS_LABELS[log.status]}</Badge>
            </div>
            {log.status === 'failed' && log.output && (
              <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-bg-sunk p-3 font-mono text-xs whitespace-pre-wrap break-all text-fg">
                {log.output}
              </pre>
            )}
          </li>
        ))}
      </ol>
      {publish.status === 'failed' && <Alert tone="danger">{T.publishFailedHint}</Alert>}
      {publish.status === 'done' && (
        <Alert>
          <p className="font-medium">
            {publish.issue === null ? T.published : T.publishedIssue(publish.issue)}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {publish.url && (
              <a
                href={publish.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                {T.openGithub}
              </a>
            )}
            <Link href={backHref} className="text-accent underline">
              {T.backToNotes}
            </Link>
          </p>
        </Alert>
      )}
    </div>
  );
}
