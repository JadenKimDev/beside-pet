'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { fetchViewer } from '@/entities/viewer';
import { LoginForm } from '@/features/login';
import { APP_NAME } from '@/shared/config';
import { Card } from '@/shared/ui';
import { loginDestination } from '../model/destination';

const LOGIN_PAGE_TEXT = { description: '관리자 계정으로 로그인해요.' } as const;

function LoginCard() {
  const router = useRouter();
  const next = useSearchParams().get('next');

  // 이미 로그인한 관리자가 열면 바로 보낸다. 로그인이 없으면(401) 폼을 그대로 둔다.
  useEffect(() => {
    let active = true;
    fetchViewer()
      .then((viewer) => {
        if (active && viewer.role === 'admin') router.replace(loginDestination(viewer.role, next));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router, next]);

  return (
    <Card className="w-full max-w-[360px] p-6">
      <h1 className="text-xl font-semibold text-fg">{APP_NAME}</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">{LOGIN_PAGE_TEXT.description}</p>
      {/* 로그인 응답(AccountResponse)의 role 로 바로 가른다. 판정은 서버가 관리자 API 에서 다시 한다. */}
      <LoginForm onSuccess={(account) => router.replace(loginDestination(account.role, next))} />
    </Card>
  );
}

export function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
