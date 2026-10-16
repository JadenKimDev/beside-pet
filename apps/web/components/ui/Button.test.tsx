// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { click, type Mounted, mount } from './test-dom';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function button(): HTMLButtonElement {
  const found = mounted?.container.querySelector('button');
  if (!found) throw new Error('button not rendered');
  return found;
}

describe('Button busy', () => {
  it('바쁠 때 aria-busy 를 달고 누름을 받지 않는다', () => {
    const onClick = vi.fn();
    mounted = mount(
      <Button busy onClick={onClick}>
        보내기
      </Button>,
    );
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().disabled).toBe(true);
    click(button());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('바쁠 때도 글자는 남겨 너비와 접근 이름을 지킨다', () => {
    mounted = mount(<Button busy>보내기</Button>);
    expect(button().textContent).toContain('보내기');
    expect(button().querySelector('[data-spinner]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('바쁘지 않으면 스피너가 없고 누름을 받는다', () => {
    const onClick = vi.fn();
    mounted = mount(<Button onClick={onClick}>보내기</Button>);
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(button().querySelector('[data-spinner]')).toBeNull();
    click(button());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Button disabled', () => {
  it('이유 없는 비활성은 disabled 속성으로 막는다', () => {
    const onClick = vi.fn();
    mounted = mount(
      <Button disabled onClick={onClick}>
        리포트
      </Button>,
    );
    expect(button().disabled).toBe(true);
    click(button());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('이유가 있는 비활성은 포커스를 받고 이유를 툴팁으로 읽히며 누름은 막는다', () => {
    const onClick = vi.fn();
    mounted = mount(
      <Button disabled disabledReason="대화를 마친 뒤에 열려요" onClick={onClick}>
        리포트
      </Button>,
    );
    const el = button();
    expect(el.disabled).toBe(false);
    expect(el.getAttribute('aria-disabled')).toBe('true');
    const tipId = el.getAttribute('aria-describedby');
    expect(tipId).toBeTruthy();
    const tip = mounted.container.querySelector(`[id="${tipId}"]`);
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.textContent).toBe('대화를 마친 뒤에 열려요');
    click(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('활성일 때는 이유를 주어도 툴팁을 달지 않는다', () => {
    mounted = mount(<Button disabledReason="대화를 마친 뒤에 열려요">리포트</Button>);
    expect(button().hasAttribute('aria-describedby')).toBe(false);
    expect(mounted.container.querySelector('[role="tooltip"]')).toBeNull();
  });
});
