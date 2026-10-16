// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';
import { click, type Mounted, mount } from './test-dom';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

const OPTIONS = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
] as const;

function buttons(): HTMLButtonElement[] {
  return Array.from(mounted?.container.querySelectorAll('button') ?? []);
}

describe('Segmented', () => {
  it('묶음은 role="group" 과 이름을 갖는다', () => {
    mounted = mount(
      <Segmented label="대화 언어" options={OPTIONS} value="ko" onChange={() => undefined} />,
    );
    const group = mounted.container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('대화 언어');
  });

  it('고른 칸만 aria-pressed="true" 다', () => {
    mounted = mount(
      <Segmented label="대화 언어" options={OPTIONS} value="en" onChange={() => undefined} />,
    );
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(buttons().every((b) => b.type === 'button')).toBe(true);
  });

  it('다른 칸을 누르면 그 값을 알리고, 고른 칸을 다시 누르면 알리지 않는다', () => {
    const onChange = vi.fn();
    mounted = mount(
      <Segmented label="대화 언어" options={OPTIONS} value="ko" onChange={onChange} />,
    );
    click(buttons()[0]);
    expect(onChange).not.toHaveBeenCalled();
    click(buttons()[1]);
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('값이 바뀌면 aria-pressed 가 따라간다', () => {
    mounted = mount(
      <Segmented label="대화 언어" options={OPTIONS} value="ko" onChange={() => undefined} />,
    );
    mounted.rerender(
      <Segmented label="대화 언어" options={OPTIONS} value="en" onChange={() => undefined} />,
    );
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });
});
