import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypewriter } from './typewriter';

const TICK_MS = 16;

const setup = () => {
  const onText = vi.fn((_visible: string) => {});
  const onComplete = vi.fn(() => {});
  const typewriter = createTypewriter({ onText, onComplete });
  return { onText, onComplete, typewriter };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTypewriter', () => {
  it('reveals pushed text a little per tick, passing the accumulated text', () => {
    const { onText, typewriter } = setup();

    typewriter.push('안녕하세요');
    expect(onText).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(onText).toHaveBeenLastCalledWith('안');

    vi.advanceTimersByTime(TICK_MS);
    expect(onText).toHaveBeenLastCalledWith('안녕');

    vi.advanceTimersByTime(TICK_MS * 3);
    expect(onText.mock.calls.map(([visible]) => visible)).toEqual([
      '안',
      '안녕',
      '안녕하',
      '안녕하세',
      '안녕하세요',
    ]);
  });

  it('keeps accumulating across later pushes', () => {
    const { onText, typewriter } = setup();

    typewriter.push('ab');
    vi.advanceTimersByTime(TICK_MS * 2);
    typewriter.push('c');
    vi.advanceTimersByTime(TICK_MS);

    expect(onText).toHaveBeenLastCalledWith('abc');
  });

  it('drains a larger backlog faster per tick', () => {
    const { onText, typewriter } = setup();
    const text = 'x'.repeat(80);

    typewriter.push(text);
    vi.advanceTimersByTime(TICK_MS);

    // 80 pending chars → ceil(80 / 8) = 10 revealed on the first tick.
    expect(onText).toHaveBeenLastCalledWith('x'.repeat(10));

    vi.advanceTimersByTime(TICK_MS * 100);
    expect(onText).toHaveBeenLastCalledWith(text);
    expect(onText.mock.calls.length).toBeLessThan(text.length);
  });

  it('fires onComplete once after finish() and the buffer drains', () => {
    const { onText, onComplete, typewriter } = setup();

    typewriter.push('abc');
    typewriter.finish();
    vi.advanceTimersByTime(TICK_MS * 2);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(onText).toHaveBeenLastCalledWith('abc');
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TICK_MS * 10);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completes on finish() even when nothing was pushed', () => {
    const { onText, onComplete, typewriter } = setup();

    typewriter.finish();
    vi.advanceTimersByTime(TICK_MS);

    expect(onText).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('never fires onComplete after cancel()', () => {
    const { onText, onComplete, typewriter } = setup();

    typewriter.push('abcdef');
    typewriter.finish();
    vi.advanceTimersByTime(TICK_MS);
    typewriter.cancel();
    const callsAtCancel = onText.mock.calls.length;

    vi.advanceTimersByTime(TICK_MS * 20);

    expect(onComplete).not.toHaveBeenCalled();
    expect(onText).toHaveBeenCalledTimes(callsAtCancel);
    expect(vi.getTimerCount()).toBe(0);
  });
});
