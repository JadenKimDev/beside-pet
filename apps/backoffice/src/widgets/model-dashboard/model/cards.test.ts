import { describe, expect, it } from 'vitest';
import { filterUsage, summarizeUsage } from '@/entities/metrics';
import { modelCards } from './cards';
import { usageRow } from './tests/fixtures';

function cardsOf(rows: Parameters<typeof summarizeUsage>[0]) {
  return Object.fromEntries(modelCards(summarizeUsage(rows)).map((card) => [card.id, card]));
}

describe('modelCards', () => {
  it('sums calls, tokens and cost and shows a single row percentile as is', () => {
    const cards = cardsOf([
      usageRow({
        calls: 1284,
        errors: 10,
        inputTokens: 412300,
        outputTokens: 98120,
        costUsd: 1.27,
      }),
    ]);
    expect(cards.calls.value).toBe('1,284회');
    expect(cards.failure.value).toBe('0.8%');
    expect(cards.failure.note).toBe('실패 10회');
    expect(cards.failure.tone).toBeUndefined();
    expect(cards.input.value).toBe('412,300');
    expect(cards.output.value).toBe('98,120');
    expect(cards.p50.value).toBe('900ms');
    expect(cards.p50.note).toBeUndefined();
    expect(cards.p95.value).toBe('2.10s');
    expect(cards.cost.value).toBe('$1.27');
    expect(cards.cost.note).toBe('단가표 기준 추정');
  });

  it('shows min–max for percentiles over several rows, never an average', () => {
    const cards = cardsOf([
      usageRow({ p50Ms: 1100, p95Ms: 2000 }),
      usageRow({ p50Ms: 2300, p95Ms: 4000, purpose: 'crisis' }),
      usageRow({ p50Ms: 1500, p95Ms: 3000, purpose: 'report' }),
    ]);
    expect(cards.p50.value).toBe('1.10s–2.30s');
    expect(cards.p50.note).toBe('3개 묶음, 아래 표에서 각각');
    expect(cards.p95.value).toBe('2.00s–4.00s');
  });

  it('marks a failure rate of 5% or more as danger', () => {
    expect(cardsOf([usageRow({ calls: 20, errors: 1 })]).failure.tone).toBe('danger');
    expect(cardsOf([usageRow({ calls: 21, errors: 1 })]).failure.tone).toBeUndefined();
  });

  it('reflects the purpose and version filter', () => {
    const rows = [
      usageRow({ calls: 7, purpose: 'reply', promptVersion: 'reply-v2' }),
      usageRow({ calls: 3, purpose: 'crisis', promptVersion: 'crisis-v1' }),
    ];
    const crisis = filterUsage(rows, { purpose: 'crisis', version: 'all' });
    expect(cardsOf(crisis).calls.value).toBe('3회');
    expect(cardsOf(filterUsage(rows, { purpose: 'all', version: 'reply-v2' })).calls.value).toBe(
      '7회',
    );
  });

  it('says there were no streaming calls when no row has a first token time', () => {
    const cards = cardsOf([usageRow({})]);
    expect(cards.firstToken.value).toBe('–');
    expect(cards.firstToken.note).toBe('스트리밍 호출 없음');
    expect(cardsOf([usageRow({ firstTokenP50Ms: 620 })]).firstToken.value).toBe('620ms');
  });

  it('shows zero and dashes for an empty period', () => {
    const cards = cardsOf([]);
    expect(cards.calls.value).toBe('0회');
    expect(cards.failure.value).toBe('–');
    expect(cards.p50.value).toBe('–');
    expect(cards.cost.value).toBe('$0.00');
  });

  it('puts calls, failure rate, p50 and p95 first on narrow screens', () => {
    const primary = modelCards(summarizeUsage([])).filter((card) => card.primary);
    expect(primary.map((card) => card.id)).toEqual(['calls', 'failure', 'p50', 'p95']);
  });
});
