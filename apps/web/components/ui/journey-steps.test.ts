import { describe, expect, it } from 'vitest';
import { JOURNEY_STEPS, journeyProgress, journeyStones } from './journey-steps';

describe('journeyStones', () => {
  it('처음 인사(task 0)는 네 칸 모두 비움이다', () => {
    expect(journeyStones(0)).toEqual(['todo', 'todo', 'todo', 'todo']);
  });

  it('task 보다 앞 칸은 채움, task 칸은 지금, 나머지는 비움이다', () => {
    expect(journeyStones(1)).toEqual(['now', 'todo', 'todo', 'todo']);
    expect(journeyStones(3)).toEqual(['done', 'done', 'now', 'todo']);
    expect(journeyStones(4)).toEqual(['done', 'done', 'done', 'now']);
  });

  it('마무리(task 5)는 네 칸 모두 채움이다', () => {
    expect(journeyStones(5)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('범위 밖과 소수는 가장 가까운 단계로 본다', () => {
    expect(journeyStones(-2)).toEqual(journeyStones(0));
    expect(journeyStones(9)).toEqual(journeyStones(5));
    expect(journeyStones(2.7)).toEqual(journeyStones(2));
    expect(journeyStones(Number.NaN)).toEqual(journeyStones(0));
  });
});

describe('journeyProgress', () => {
  it('진행값은 (task-1) 을 0..4 로 자른 것이고 퍼센트는 그 1/4 이다(ADR-0005)', () => {
    expect(JOURNEY_STEPS).toBe(4);
    expect(journeyProgress(0)).toEqual({ step: 0, valueNow: 0, percent: 0 });
    expect(journeyProgress(1)).toEqual({ step: 1, valueNow: 0, percent: 0 });
    expect(journeyProgress(3)).toEqual({ step: 3, valueNow: 2, percent: 50 });
    expect(journeyProgress(4)).toEqual({ step: 4, valueNow: 3, percent: 75 });
    expect(journeyProgress(5)).toEqual({ step: 4, valueNow: 4, percent: 100 });
  });
});
