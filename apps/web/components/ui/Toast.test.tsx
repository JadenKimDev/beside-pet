// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_LIFETIME_MS, Toast } from './Toast';
import { click, type Mounted, mount } from './test-dom';

let mounted: Mounted | undefined;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Toast', () => {
  it('성공 토스트는 role="status" 이고 4초 뒤에 스스로 닫힌다', () => {
    const onDismiss = vi.fn();
    mounted = mount(<Toast message="저장했어요" onDismiss={onDismiss} />);
    expect(TOAST_LIFETIME_MS).toBe(4000);
    expect(mounted.container.querySelector('[role="status"]')?.textContent).toContain('저장했어요');
    advance(3999);
    expect(onDismiss).not.toHaveBeenCalled();
    advance(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('오류 토스트는 role="alert" 이고 시간이 지나도 머문다', () => {
    const onDismiss = vi.fn();
    mounted = mount(
      <Toast
        tone="error"
        message="보내지 못했어요"
        retryLabel="다시 시도"
        onRetry={() => undefined}
        onDismiss={onDismiss}
      />,
    );
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain(
      '보내지 못했어요',
    );
    advance(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('오류 토스트의 다시 시도 버튼이 onRetry 를 부른다', () => {
    const onRetry = vi.fn();
    mounted = mount(
      <Toast
        tone="error"
        message="보내지 못했어요"
        retryLabel="다시 시도"
        onRetry={onRetry}
        onDismiss={() => undefined}
      />,
    );
    const retry = Array.from(mounted.container.querySelectorAll('button')).find(
      (b) => b.textContent === '다시 시도',
    );
    if (!retry) throw new Error('retry missing');
    click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('닫히기 전에 메시지가 바뀌면 4초를 새로 센다', () => {
    const onDismiss = vi.fn();
    mounted = mount(<Toast message="저장했어요" onDismiss={onDismiss} />);
    advance(3000);
    mounted.rerender(<Toast message="지웠어요" onDismiss={onDismiss} />);
    advance(3000);
    expect(onDismiss).not.toHaveBeenCalled();
    advance(1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
