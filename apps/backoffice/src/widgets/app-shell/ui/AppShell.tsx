'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { type Viewer, ViewerName } from '@/entities/viewer';
import { LogoutButton } from '@/features/logout';
import { APP_NAME } from '@/shared/config';
import { cn } from '@/shared/lib';
import { LOGIN_PATH } from '../model/gate';
import { isCurrentNav, NAV_ITEMS } from '../model/nav';

const SHELL_TEXT = { nav: '주 메뉴' } as const;

/** 로그인한 화면의 머리와 본문 틀. 화면 제목은 각 화면이 `PageTitle` 로 단다. */
export function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = (className: string, itemClassName: string) => (
    <nav aria-label={SHELL_TEXT.nav} className={className}>
      {NAV_ITEMS.map((item) => {
        const current = isCurrentNav(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex items-center justify-center border-b-2 text-sm',
              current
                ? 'border-accent font-medium text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
              itemClassName,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4 md:gap-6 md:px-6">
          <Link href="/models" className="shrink-0 text-sm font-semibold whitespace-nowrap text-fg">
            {APP_NAME}
          </Link>
          {nav('hidden h-full items-stretch gap-5 md:flex', 'px-1')}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <ViewerName viewer={viewer} />
            <LogoutButton onDone={() => router.replace(LOGIN_PATH)} className="shrink-0" />
          </div>
        </div>
        {nav('grid grid-cols-3 border-t border-border md:hidden', 'h-11')}
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
