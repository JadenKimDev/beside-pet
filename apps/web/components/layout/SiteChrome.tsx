'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { chromeFor } from './chrome';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/** 모든 화면을 머리와 바닥으로 감싼다. 머리 변형은 경로로 고른다(chrome.ts). */
export function SiteChrome({ children }: { children: ReactNode }) {
  const chrome = chromeFor(usePathname());
  return (
    <>
      <SiteHeader
        variant={chrome.variant}
        showLocale={chrome.showLocale}
        showHelp={chrome.crisis}
        sticky={chrome.stickyHeader}
      />
      {children}
      <SiteFooter showCrisis={chrome.crisis} />
    </>
  );
}
