// 그래프의 축, 격자, 툴팁 모양. 색은 globals.css 의 토큰만 쓴다.
import type { CSSProperties, ReactNode } from 'react';

export const AXIS_TICK = { fill: 'var(--fg-muted)', fontSize: 12 };
export const AXIS_LINE = 'var(--border)';
export const GRID_LINE = 'var(--border)';
export const LEGEND_STYLE: CSSProperties = { fontSize: 12, color: 'var(--fg)', paddingBottom: 12 };
export const TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--fg)',
};

/** 툴팁의 날짜: `2026-10-14 (UTC)`. */
export const utcLabel = (label: ReactNode) => `${String(label)} (UTC)`;

/** 범례와 맨 위 눈금이 겹치지 않게 위에 여백을 둔다. */
export const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: 0 };
