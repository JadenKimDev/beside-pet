// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, type ModalProps } from './Modal';
import { click, type Mounted, mount, pressKey } from './test-dom';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

function Screen({ open, ...props }: Partial<ModalProps> & { open: boolean }) {
  return (
    <div>
      <button type="button" id="opener">
        지우기
      </button>
      <Modal
        open={open}
        title="이 대화를 지울까요?"
        body="지운 대화는 되돌릴 수 없어요."
        cancelLabel="취소"
        confirmLabel="지우기"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        {...props}
      />
    </div>
  );
}

function dialog(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!found) throw new Error('dialog not rendered');
  return found;
}

function dialogButtons(): HTMLButtonElement[] {
  return Array.from(dialog().querySelectorAll('button'));
}

function openFromOpener(props: Partial<ModalProps> = {}): HTMLElement {
  mounted = mount(<Screen open={false} {...props} />);
  const opener = document.getElementById('opener');
  if (!opener) throw new Error('opener missing');
  opener.focus();
  mounted.rerender(<Screen open {...props} />);
  return opener;
}

describe('Modal', () => {
  it('열리면 aria-modal 대화창이 제목으로 이름을 갖고 포커스가 안으로 들어간다', () => {
    openFromOpener();
    const el = dialog();
    expect(el.getAttribute('aria-modal')).toBe('true');
    const titleId = el.getAttribute('aria-labelledby');
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('이 대화를 지울까요?');
    expect(el.contains(document.activeElement)).toBe(true);
  });

  it('닫히면 포커스를 연 버튼으로 돌려준다', () => {
    const opener = openFromOpener();
    expect(document.activeElement).not.toBe(opener);
    mounted?.rerender(<Screen open={false} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Tab 은 마지막에서 처음으로, Shift+Tab 은 처음에서 마지막으로 돈다', () => {
    openFromOpener();
    const [first, , last] = [dialogButtons()[0], null, dialogButtons().at(-1)];
    if (!first || !last) throw new Error('buttons missing');
    last.focus();
    expect(pressKey(last, 'Tab')).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(pressKey(first, 'Tab', { shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('Esc 와 바깥 누름은 취소다', () => {
    const onCancel = vi.fn();
    openFromOpener({ onCancel });
    pressKey(dialog(), 'Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    const backdrop = document.querySelector('[data-modal-backdrop]');
    if (!backdrop) throw new Error('backdrop missing');
    click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('창 안을 눌러도 취소되지 않는다', () => {
    const onCancel = vi.fn();
    openFromOpener({ onCancel });
    click(dialog());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('확인과 취소 버튼이 각자의 동작을 부른다', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    openFromOpener({ onCancel, onConfirm });
    const cancel = dialogButtons().find((b) => b.textContent === '취소');
    const confirm = dialogButtons().find((b) => b.textContent?.includes('지우기'));
    if (!cancel || !confirm) throw new Error('actions missing');
    click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('바쁠 때는 두 버튼이 막히고 Esc 와 바깥 누름도 취소하지 않는다', () => {
    const onCancel = vi.fn();
    openFromOpener({ onCancel, busy: true });
    expect(dialogButtons().every((b) => b.disabled)).toBe(true);
    pressKey(dialog(), 'Escape');
    const backdrop = document.querySelector('[data-modal-backdrop]');
    if (backdrop) click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
