// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';
import { click, type Mounted, mount, pressKey } from './test-dom';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function open(onDelete = vi.fn()) {
  mounted = mount(
    <Menu
      label="더 보기"
      icon={<span />}
      items={[
        { label: '다시 보기', onSelect: () => undefined },
        { label: '삭제', tone: 'danger', onSelect: onDelete },
      ]}
    />,
  );
  const trigger = mounted.container.querySelector('button');
  if (!trigger) throw new Error('trigger missing');
  click(trigger);
  return trigger;
}

const entries = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

describe('Menu', () => {
  it('열리면 첫 항목으로 포커스, 화살표로 돌고, Esc 는 닫고 버튼으로 돌아온다', () => {
    const trigger = open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(entries()[0]);
    pressKey(entries()[0] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(entries()[1]);
    pressKey(entries()[1] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(entries()[0]);
    pressKey(entries()[0] as HTMLElement, 'Escape');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('항목을 고르면 닫히고 그 동작을 부른다', () => {
    const onDelete = vi.fn();
    open(onDelete);
    click(entries()[1] as HTMLElement);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
