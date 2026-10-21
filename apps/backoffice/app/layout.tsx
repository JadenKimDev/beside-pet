import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';
import { bodyClassName, rootClassName } from '@/app/styles';
import { APP_NAME } from '@/shared/config';
import './globals.css';

export const metadata: Metadata = { title: APP_NAME, robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" className={rootClassName}>
      <body className={bodyClassName}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
