'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModelsResponse, UsageDay } from '@/entities/metrics';
import { formatCount, formatUsd } from '@/shared/lib';
import { Card, EmptyState, Field, Select } from '@/shared/ui';
import {
  ALL_MODELS,
  chartModelOptions,
  formatTokenTick,
  hasUsage,
  shortDate,
  usageChartRows,
} from '../model/charts';
import { ChartFigure, type FigureColumn } from './ChartFigure';
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_MARGIN,
  GRID_LINE,
  LEGEND_STYLE,
  TOOLTIP_STYLE,
  utcLabel,
} from './chartStyle';

const count = (value?: TooltipValueType) => formatCount(Number(value));
const usd = (value?: TooltipValueType) => formatUsd(Number(value));

const CALL_COLUMNS: FigureColumn<UsageDay>[] = [
  { label: '호출', value: (row) => formatCount(row.calls) },
  { label: '실패', value: (row) => formatCount(row.errors) },
];
const TOKEN_COLUMNS: FigureColumn<UsageDay>[] = [
  { label: '입력', value: (row) => formatCount(row.inputTokens) },
  { label: '출력', value: (row) => formatCount(row.outputTokens) },
];
const COST_COLUMNS: FigureColumn<UsageDay>[] = [
  { label: '비용', value: (row) => formatUsd(row.costUsd) },
];

function xAxis() {
  return (
    <XAxis
      dataKey="date"
      tickFormatter={shortDate}
      tick={AXIS_TICK}
      stroke={AXIS_LINE}
      interval="preserveStartEnd"
      minTickGap={16}
    />
  );
}

/** 날짜별 그래프 셋. `daily` 로 그리고 역할·버전 거르기와 무관하다. */
export function UsageCharts({ response }: { response: ModelsResponse }) {
  const [model, setModel] = useState<string>(ALL_MODELS);
  const options = useMemo(() => chartModelOptions(response), [response]);
  const rows = useMemo(() => usageChartRows(response, model), [response, model]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-base font-semibold text-fg">
          날짜별 추이{' '}
          <span className="text-xs font-normal text-fg-muted">
            · 역할과 버전 거르기는 적용되지 않아요
          </span>
        </h2>
        <div className="sm:w-64">
          <Field label="모델" htmlFor="usage-chart-model">
            <Select
              id="usage-chart-model"
              options={options}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
        </div>
      </div>
      {hasUsage(rows) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartFigure
            title="날짜별 호출과 실패"
            rows={rows}
            columns={CALL_COLUMNS}
            className="md:col-span-2"
          >
            <BarChart data={rows} margin={CHART_MARGIN}>
              <CartesianGrid stroke={GRID_LINE} vertical={false} />
              {xAxis()}
              <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} width={40} />
              <Tooltip labelFormatter={utcLabel} formatter={count} contentStyle={TOOLTIP_STYLE} />
              <Legend verticalAlign="top" align="left" wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="calls" name="호출" fill="var(--chart-1)" isAnimationActive={false} />
              <Bar dataKey="errors" name="실패" fill="var(--danger)" isAnimationActive={false} />
            </BarChart>
          </ChartFigure>
          <ChartFigure title="날짜별 토큰" rows={rows} columns={TOKEN_COLUMNS}>
            <BarChart data={rows} margin={CHART_MARGIN}>
              <CartesianGrid stroke={GRID_LINE} vertical={false} />
              {xAxis()}
              <YAxis
                tickFormatter={formatTokenTick}
                tick={AXIS_TICK}
                stroke={AXIS_LINE}
                width={48}
              />
              <Tooltip labelFormatter={utcLabel} formatter={count} contentStyle={TOOLTIP_STYLE} />
              <Legend verticalAlign="top" align="left" wrapperStyle={LEGEND_STYLE} />
              <Bar
                dataKey="inputTokens"
                name="입력"
                stackId="tokens"
                fill="var(--chart-2)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="outputTokens"
                name="출력"
                stackId="tokens"
                fill="var(--chart-3)"
                isAnimationActive={false}
              />
            </BarChart>
          </ChartFigure>
          <ChartFigure title="날짜별 추정 비용" rows={rows} columns={COST_COLUMNS}>
            <LineChart data={rows} margin={CHART_MARGIN}>
              <CartesianGrid stroke={GRID_LINE} vertical={false} />
              {xAxis()}
              <YAxis tickFormatter={usd} tick={AXIS_TICK} stroke={AXIS_LINE} width={56} />
              <Tooltip labelFormatter={utcLabel} formatter={usd} contentStyle={TOOLTIP_STYLE} />
              <Legend verticalAlign="top" align="left" wrapperStyle={LEGEND_STYLE} />
              <Line
                dataKey="costUsd"
                name="비용"
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--chart-4)' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartFigure>
        </div>
      ) : (
        <Card>
          <EmptyState title="이 기간에는 기록이 없어요." description="기간을 넓혀 보세요." />
        </Card>
      )}
    </section>
  );
}
