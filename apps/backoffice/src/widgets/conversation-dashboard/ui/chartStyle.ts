// 그래프의 축, 격자, 툴팁 모양. 색은 globals.css 의 토큰만 쓴다.
import type { CSSProperties, ReactNode } from 'react';

export const TICK = { fill: 'var(--fg-muted)', fontSize: 12 };
export const LINE = 'var(--border)';
export const LEGEND: CSSProperties = { fontSize: 12, color: 'var(--fg)', paddingBottom: 12 };
export const TOOLTIP: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--fg)',
};

/** `YYYY-MM-DD` → `MM/DD`. */
export const dayTick = (date: string) => date.slice(5).replace('-', '/');
/** 툴팁의 날짜: `2026-10-14 (UTC)`. */
export const dayLabel = (label: ReactNode) => `${String(label)} (UTC)`;

/** 범례와 맨 위 눈금이 겹치지 않게 위에 여백을 둔다. */
export const MARGIN = { top: 4, right: 8, bottom: 0, left: 0 };
