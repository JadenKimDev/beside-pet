// 테스트 전용 도우미: jsdom 위에 React 를 그리고 지운다. @testing-library 없이 react-dom/client 와 act 만 쓴다.
// DOM 이 필요한 테스트 파일은 머리에 `// @vitest-environment jsdom` 을 둔다.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export type Mounted = {
  container: HTMLElement;
  rerender: (node: ReactNode) => void;
  unmount: () => void;
};

/** `node` 를 body 에 붙인 새 칸에 그린다. 끝나면 `unmount` 로 치운다. */
export function mount(node: ReactNode): Mounted {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 키 하나를 누른다(keydown 만). 기본 동작이 막혔으면 true. */
export function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

export function click(target: Element): void {
  act(() => {
    (target as HTMLElement).click();
  });
}
