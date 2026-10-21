'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/shared/lib';
import { Card } from '@/shared/ui';

export type FigureColumn<Row> = { label: string; value: (row: Row) => string };

type ChartFigureProps<Row extends { date: string }> = {
  title: string;
  rows: readonly Row[];
  columns: readonly FigureColumn<Row>[];
  className?: string;
  children: ReactElement;
};

/** 그래프 하나: 제목, "날짜는 UTC 기준", 그래프, 같은 수치를 담은 스크린 리더용 표. */
export function ChartFigure<Row extends { date: string }>({
  title,
  rows,
  columns,
  className,
  children,
}: ChartFigureProps<Row>) {
  return (
    <Card className={cn('min-w-0', className)}>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm font-semibold text-fg">
          {title} <span className="text-xs font-normal text-fg-muted">· 날짜는 UTC 기준</span>
        </figcaption>
        <div aria-hidden className="h-[200px] sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <thead>
            <tr>
              <th scope="col">날짜</th>
              {columns.map((column) => (
                <th key={column.label} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row">{row.date}</th>
                {columns.map((column) => (
                  <td key={column.label}>{column.value(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </Card>
  );
}
