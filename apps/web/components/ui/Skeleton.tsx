'use client';

import './ui.css';
import { type ReactNode, useEffect, useState } from 'react';
import { cx } from './cx';

/** 불러오는 동안 실제 배치와 같은 모양으로 두는 반짝임 막대. 크기는 `className` 으로 정한다. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('ui-shimmer rounded-sm', className)} />;
}

/** 스켈레톤이 나타나기까지 기다리는 시간. 이보다 빨리 끝나면 보이지 않는다(깜박임 방지). */
export const SKELETON_DELAY_MS = 300;

/**
 * 스켈레톤 묶음. `aria-busy="true"` 와 읽을 이름(`label`)을 달고, 300ms 뒤에야 막대를 보인다.
 */
export function SkeletonArea({
  label,
  delayMs = SKELETON_DELAY_MS,
  className,
  children,
}: {
  label: string;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <div aria-busy="true" aria-label={label} role="status" className={className}>
      {shown && children}
    </div>
  );
}
