import type { ReactNode } from 'react';

/** 카드 머리: 제목(명조)과 한 줄 설명. 카드 안의 상태마다 같은 모양. */
export function CardHead({
  title,
  lead,
  badge,
}: {
  title: string;
  lead: string;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {badge}
      <h2 className="m-0 text-h2 font-bold">{title}</h2>
      <p className="mt-1.5 mb-0 text-sm text-fg-muted">{lead}</p>
    </div>
  );
}

/** 카드 아래의 바꾸기 줄("아직 계정이 없나요? 계정 신청하기"). */
export function SwitchLine({
  lead,
  action,
  onClick,
}: {
  lead?: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <p className="mt-5 mb-0 text-center text-sm text-fg-muted">
      {lead && <>{lead} </>}
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-sm font-semibold text-accent-ink underline-offset-4 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
      >
        {action}
      </button>
    </p>
  );
}
