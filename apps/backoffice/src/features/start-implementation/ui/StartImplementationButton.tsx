'use client';

import type { IssueCard } from '@/entities/issue';
import { Button, type ButtonSize } from '@/shared/ui';
import {
  type StartImplementationOptions,
  useStartImplementation,
} from '../model/useStartImplementation';
import { canStartImplementation } from '../model/visibility';

export type StartImplementationButtonProps = StartImplementationOptions & {
  issue: Pick<IssueCard, 'number' | 'state' | 'column' | 'labels'>;
  /** 보드의 첫 열 이름(`board.columns[0] ?? null`). 이 열의 이슈에만 버튼이 보인다. */
  firstColumn: string | null;
  /** 버튼의 글. 글자는 views·widgets 가 준다. */
  label: string;
  size?: ButtonSize;
};

/** 보드 첫 열의 열린 이슈에 run:implement 가 없을 때만 보이고, 붙고 나면 사라진다. 오류 문구는 onError 로 넘긴다. */
export function StartImplementationButton({
  issue,
  firstColumn,
  label,
  size = 'sm',
  onStarted,
  onError,
}: StartImplementationButtonProps) {
  const { status, start } = useStartImplementation(issue.number, { onStarted, onError });

  if (status === 'done' || !canStartImplementation(issue, firstColumn)) return null;

  return (
    <Button size={size} variant="primary" busy={status === 'pending'} onClick={() => void start()}>
      {label}
    </Button>
  );
}
