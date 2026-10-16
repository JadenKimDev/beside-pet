'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, resolveTheme, type Theme } from '@/theme/config';

// layout.tsx 가 서버에서 찍은 <html data-theme> 을 읽는다. 바뀌면(설정에서 테마를 고르면) 따라간다.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const read = (): Theme => resolveTheme(document.documentElement.dataset.theme);

export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
}
