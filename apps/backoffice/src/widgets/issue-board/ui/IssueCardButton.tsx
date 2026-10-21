import { ISSUE_STATE_LABELS, ISSUE_STATE_TONES, type IssueCard } from '@/entities/issue';
import { cn } from '@/shared/lib';
import { Badge } from '@/shared/ui';
import { ISSUE_BOARD_TEXT as T, updatedText } from '../model/board';
import { LabelChips } from './LabelChips';

export type IssueCardButtonProps = {
  card: IssueCard;
  selected: boolean;
  onSelect: (card: IssueCard) => void;
};

/** 보드의 카드 하나. 누르면 상세가 열린다. */
export function IssueCardButton({ card, selected, onSelect }: IssueCardButtonProps) {
  return (
    <article
      className={cn(
        'relative flex flex-col gap-2 rounded-md border bg-surface p-3',
        selected ? 'border-accent' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-fg-muted">#{card.number}</span>
        <Badge tone={ISSUE_STATE_TONES[card.state]}>{ISSUE_STATE_LABELS[card.state]}</Badge>
      </div>
      <h3 className="text-sm font-medium break-words text-fg">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => onSelect(card)}
          className="text-left after:absolute after:inset-0 after:rounded-md"
        >
          {card.title}
        </button>
      </h3>
      <LabelChips labels={card.labels} />
      <time dateTime={card.updatedAt} className="text-xs text-fg-muted">
        {T.updated(updatedText(card.updatedAt))}
      </time>
    </article>
  );
}
