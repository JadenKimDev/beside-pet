'use client';

import { type ReactElement, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCount } from '@/shared/lib';
import { Card } from '@/shared/ui';
import type { ConversationChartRow } from '../model/cards';
import { dayLabel, dayTick, LEGEND, LINE, MARGIN, TICK, TOOLTIP } from './chartStyle';

type Column = { label: string; value: (row: ConversationChartRow) => number };

const ACTIVITY: Column[] = [
  { label: '대화', value: (row) => row.sessions },
  { label: '턴', value: (row) => row.turns },
];
const CRISIS: Column[] = [
  { label: '키워드', value: (row) => row.keyword },
  { label: '모델 판정', value: (row) => row.model },
];

const count = (value?: TooltipValueType) => formatCount(Number(value));

/** 480px 이상인가. 좁은 화면에서는 두 번째 y 축을 숨긴다. */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 480px)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

function Figure({
  title,
  rows,
  columns,
  children,
}: {
  title: string;
  rows: readonly ConversationChartRow[];
  columns: readonly Column[];
  children: ReactElement;
}) {
  return (
    <Card className="min-w-0">
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
                  <td key={column.label}>{formatCount(column.value(row))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </Card>
  );
}

/** 날짜별 대화와 턴, 날짜별 위기 감지. */
export function ConversationCharts({ rows }: { rows: readonly ConversationChartRow[] }) {
  const wide = useWide();
  const data = [...rows];
  const xAxis = (
    <XAxis
      dataKey="date"
      tickFormatter={dayTick}
      tick={TICK}
      stroke={LINE}
      interval="preserveStartEnd"
      minTickGap={16}
    />
  );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Figure title="날짜별 대화와 턴" rows={rows} columns={ACTIVITY}>
        <ComposedChart data={data} margin={MARGIN}>
          <CartesianGrid stroke={LINE} vertical={false} />
          {xAxis}
          <YAxis yAxisId="sessions" allowDecimals={false} tick={TICK} stroke={LINE} width={36} />
          <YAxis
            yAxisId="turns"
            orientation="right"
            allowDecimals={false}
            tick={TICK}
            stroke={LINE}
            width={36}
            hide={!wide}
          />
          <Tooltip labelFormatter={dayLabel} formatter={count} contentStyle={TOOLTIP} />
          <Legend verticalAlign="top" align="left" wrapperStyle={LEGEND} />
          <Bar
            yAxisId="sessions"
            dataKey="sessions"
            name="대화"
            fill="var(--chart-1)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="turns"
            dataKey="turns"
            name="턴"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--chart-2)' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </Figure>
      <Figure title="날짜별 위기 감지" rows={rows} columns={CRISIS}>
        <BarChart data={data} margin={MARGIN}>
          <CartesianGrid stroke={LINE} vertical={false} />
          {xAxis}
          <YAxis allowDecimals={false} tick={TICK} stroke={LINE} width={36} />
          <Tooltip labelFormatter={dayLabel} formatter={count} contentStyle={TOOLTIP} />
          <Legend verticalAlign="top" align="left" wrapperStyle={LEGEND} />
          <Bar
            dataKey="keyword"
            name="키워드"
            stackId="crisis"
            fill="var(--chart-5)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="model"
            name="모델 판정"
            stackId="crisis"
            fill="var(--warning)"
            isAnimationActive={false}
          />
        </BarChart>
      </Figure>
    </div>
  );
}
