import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BreakdownFilter } from '@/entities/metrics';
import { dailyRow, modelsResponse, usageRow } from '../model/tests/fixtures';
import { ModelDashboard } from './ModelDashboard';

const ALL: BreakdownFilter = { purpose: 'all', version: 'all' };
const noop = () => {};

function render(props: Partial<Parameters<typeof ModelDashboard>[0]>) {
  return renderToStaticMarkup(
    <ModelDashboard data={null} loading={false} filter={ALL} onFilterChange={noop} {...props} />,
  );
}

describe('ModelDashboard', () => {
  it('shows placeholders while the first response is loading', () => {
    const html = render({ loading: true });
    expect(html).toContain('불러오고 있어요');
    expect(html).not.toContain('회</');
  });

  it('shows zero cards and the empty state when the period has no calls', () => {
    const html = render({ data: modelsResponse({}) });
    expect(html).toContain('0회');
    expect(html).toContain('이 기간에는 모델 호출이 없어요.');
    expect(html).toContain('기간을 넓혀 보세요.');
  });

  it('offers to clear the filter when only the filtered rows are empty', () => {
    const data = modelsResponse({
      models: [usageRow({ purpose: 'reply' })],
      daily: [dailyRow({})],
    });
    const html = render({ data, filter: { purpose: 'report', version: 'all' } });
    expect(html).toContain('고른 역할과 버전에 맞는 호출이 없어요.');
    expect(html).toContain('거르기 지우기');
  });

  it('draws the daily numbers, with empty days filled, in the screen reader table', () => {
    const data = modelsResponse({
      models: [usageRow({ calls: 9 })],
      daily: [
        dailyRow({ date: '2026-10-14', calls: 5 }),
        dailyRow({ date: '2026-10-16', calls: 4 }),
      ],
    });
    const html = render({ data });
    expect(html).toContain('역할과 버전 거르기는 적용되지 않아요');
    expect(html).toContain('날짜는 UTC 기준');
    expect(html).toMatch(/2026-10-15<\/th><td[^>]*>0</);
    expect(html).toMatch(/2026-10-16<\/th><td[^>]*>4</);
  });

  it('lists the filtered rows in the breakdown, most calls first', () => {
    const data = modelsResponse({
      models: [
        usageRow({ calls: 3, promptVersion: 'reply-v1' }),
        usageRow({ calls: 8, promptVersion: 'reply-v2' }),
        usageRow({ calls: 50, purpose: 'crisis', promptVersion: 'crisis-v1' }),
      ],
      daily: [dailyRow({})],
    });
    const html = render({ data, filter: { purpose: 'reply', version: 'all' } });
    expect(html.indexOf('reply-v2</td>')).toBeLessThan(html.indexOf('reply-v1</td>'));
    expect(html).not.toContain('crisis-v1</td>');
  });

  it('names the reply judge calls 판정 in the breakdown', () => {
    const data = modelsResponse({
      models: [usageRow({ purpose: 'judge', promptVersion: 'judge-v1' })],
      daily: [dailyRow({})],
    });
    const html = render({ data });
    expect(html).toContain('>판정</span>');
    expect(html).toContain('judge-v1</td>');
  });
});
