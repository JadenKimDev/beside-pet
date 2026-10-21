'use client';

// 관리자가 아닌 계정의 안내. 화면 쪽 막음은 편의이고 판정은 서버(`403 Insufficient role`)다.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchViewer, isAdmin, type Viewer } from '@/entities/viewer';
import { LogoutButton } from '@/features/logout';
import { isUnauthorized } from '@/shared/api';
import { Card, EmptyState } from '@/shared/ui';
import { LOGIN_PATH } from '@/widgets/app-shell';

const FORBIDDEN_TEXT = {
  title: '이 계정으로는 운영 화면을 쓸 수 없어요',
  description: '관리자 계정으로 다시 로그인해 주세요.',
  current: '지금 계정: ',
  switchAccount: '다른 계정으로 로그인',
} as const;

export function ForbiddenPage() {
  const router = useRouter();
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let active = true;
    fetchViewer()
      .then((found) => {
        if (!active) return;
        if (isAdmin(found)) router.replace('/models');
        else setViewer(found);
      })
      .catch((error: unknown) => {
        if (active && isUnauthorized(error)) router.replace(LOGIN_PATH);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-[420px] flex-col items-center gap-2 p-6">
        <EmptyState title={FORBIDDEN_TEXT.title} description={FORBIDDEN_TEXT.description} />
        {viewer && (
          <p className="max-w-full truncate text-sm text-fg-muted" title={viewer.username}>
            {FORBIDDEN_TEXT.current}
            {viewer.username}
          </p>
        )}
        <LogoutButton
          variant="primary"
          size="md"
          label={FORBIDDEN_TEXT.switchAccount}
          className="mt-2 w-full"
          onDone={() => router.replace(LOGIN_PATH)}
        />
      </Card>
    </main>
  );
}
