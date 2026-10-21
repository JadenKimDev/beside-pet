import { type RefObject, useLayoutEffect } from 'react';

/**
 * 입력창(sticky)이 덮는 높이를 `--composer-height` 로 주고받는다. 입력창이 재어 가장 가까운
 * `main`(없으면 문서 루트)에 두고, 목록은 그 값으로 끝 표시의 멈출 자리와 바닥 판정을 맞춘다.
 * 입력창이 없으면 0 이다. 높이는 글에 따라 자라므로 숫자로 두지 않고 이 변수만 읽는다.
 */
export const COMPOSER_HEIGHT_VAR = '--composer-height';

/** 변수를 두는 자리: 가장 가까운 `main`, 없으면 문서 루트. */
export function composerHost(element: Element): HTMLElement {
  return element.closest<HTMLElement>('main') ?? element.ownerDocument.documentElement;
}

/** 지금 입력창이 덮는 높이(px). 정해지지 않았으면 0. */
export function readComposerHeight(element: Element): number {
  const value = Number.parseFloat(
    composerHost(element).style.getPropertyValue(COMPOSER_HEIGHT_VAR),
  );
  return Number.isFinite(value) ? value : 0;
}

/**
 * 바닥에 붙은 요소(입력창, 위기 뒤 멈춤 안내)가 자기 높이를 재어 `--composer-height` 로 알린다.
 * 자라면 ResizeObserver 가 다시 재고, 사라질 때 0 으로 되돌린다.
 */
export function useComposerHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const host = composerHost(element);
    const measure = () => {
      host.style.setProperty(COMPOSER_HEIGHT_VAR, `${element.getBoundingClientRect().height}px`);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      host.style.setProperty(COMPOSER_HEIGHT_VAR, '0px');
    };
  }, [ref]);
}
