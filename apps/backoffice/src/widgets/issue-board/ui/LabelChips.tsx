import type { IssueLabel } from '@/entities/issue';

const HEX = /^[0-9a-f]{6}$/i;

/** 라벨은 뉴트럴 칩이고 GitHub 의 색은 앞의 점에만 데이터로 싣는다(글자 대비는 토큰이 맡는다). */
export function LabelChips({ labels }: { labels: readonly IssueLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <li
          key={label.name}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-bg-sunk px-2 py-0.5 text-xs text-fg-muted"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full border border-border-strong"
            style={HEX.test(label.color) ? { backgroundColor: `#${label.color}` } : undefined}
          />
          <span className="truncate">{label.name}</span>
        </li>
      ))}
    </ul>
  );
}
