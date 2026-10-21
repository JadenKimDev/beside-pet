import type { IssueComment } from '@/entities/issue';
import { dateTimeText, ISSUE_DETAIL_TEXT as T } from '../model/detail';
import { IssueMarkdown } from './IssueMarkdown';

/** 댓글 목록. 작성자, 시각, 본문(마크다운, 스크린샷 포함). */
export function IssueComments({ comments }: { comments: readonly IssueComment[] }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">{T.comments(comments.length)}</h3>
      {comments.length === 0 ? (
        <p className="text-sm text-fg-muted">{T.noComments}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-bg-sunk px-3 py-2 text-xs">
                <span className="font-medium text-fg">{comment.author ?? T.unknownAuthor}</span>
                <time dateTime={comment.createdAt} className="text-fg-muted">
                  {dateTimeText(comment.createdAt)}
                </time>
              </div>
              <div className="px-3 py-3">
                <IssueMarkdown text={comment.body} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
