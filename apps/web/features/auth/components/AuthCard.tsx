'use client';

/**
 * AuthCard — 첫 화면 오른쪽의 카드 한 자리. 상태만 바뀐다:
 * 확인 중(스켈레톤) → 첫 관리자 설정(setupRequired) / 신청 완료(registered) / 계정 신청 / 로그인.
 * 상태와 유스케이스는 auth.store 에 있고, 여기에는 로그인·신청 중 무엇을 보일지만 둔다.
 */
import { type ReactNode, useState } from 'react';
import { cx, Skeleton, SkeletonArea } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { LoginForm } from './LoginForm';
import { RegisterDone } from './RegisterDone';
import { RegisterForm } from './RegisterForm';
import { SetupForm } from './SetupForm';

export function AuthCard({ className }: { className?: string }) {
  const t = useTranslations().auth;
  const ready = useAuthStore((s) => s.ready);
  const setupRequired = useAuthStore((s) => s.setupRequired);
  const registered = useAuthStore((s) => s.registered);
  const principal = useAuthStore((s) => s.principal);
  const resetRegistered = useAuthStore((s) => s.resetRegistered);
  const [registering, setRegistering] = useState(false);

  // 모드를 바꿀 때 앞 폼의 오류와 신청 완료 표시를 지운다.
  const switchTo = (next: boolean) => {
    resetRegistered();
    setRegistering(next);
  };

  let body: ReactNode;
  // 확인 중이거나, 로그인돼 다음 화면으로 넘어가는 동안은 스켈레톤.
  if (!ready || principal) {
    body = (
      <SkeletonArea label={t.checking} className="grid gap-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-pill" />
      </SkeletonArea>
    );
  } else if (setupRequired) {
    body = <SetupForm />;
  } else if (registered) {
    body = <RegisterDone onBackToLogin={() => switchTo(false)} />;
  } else if (registering) {
    body = <RegisterForm onBackToLogin={() => switchTo(false)} />;
  } else {
    body = <LoginForm onRegister={() => switchTo(true)} />;
  }

  return (
    <div
      className={cx(
        'relative z-[1] w-full rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-8 shadow-3 backdrop-blur-[8px] max-sm:px-5 max-sm:py-6',
        className,
      )}
    >
      {body}
    </div>
  );
}
