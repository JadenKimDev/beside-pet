// @vitest-environment jsdom
// 걸음 표시: 도달한 칸까지 채우고, 다음 칸의 연결선(absolute)이 앞 칸의 번호 원을 덮지 않게
// 원이 선보다 위에 쌓인다(jsdom 은 칠하는 순서를 재지 않아 클래스로 본다).
import { afterEach, describe, expect, it } from 'vitest';
import { type Mounted, mount } from '@/components/ui/test-dom';
import { ReportSteps } from './ReportSteps';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

const NAMES = ['하나', '둘', '셋', '넷'] as const;

function render(reached: number) {
  mounted = mount(<ReportSteps reached={reached} names={NAMES} label="걸음" />);
  return mounted.container;
}

describe('ReportSteps', () => {
  it('도달한 칸까지 채운다', () => {
    const container = render(2);
    const filled = Array.from(container.querySelectorAll('li'), (li) => li.dataset.filled);
    expect(filled).toEqual(['true', 'true', 'false', 'false']);
  });

  it('번호 원이 연결선보다 위에 쌓인다', () => {
    const container = render(2);
    const circles = Array.from(container.querySelectorAll('li'), (li) =>
      Array.from(li.children).find((child) => child.textContent && /^\d$/.test(child.textContent)),
    );
    expect(circles).toHaveLength(4);
    for (const circle of circles) expect(circle?.className.split(/\s+/)).toContain('z-10');
  });
});
