'use client';

import { useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/shared/ui';
import { signOut } from '../api/logout';

export const LOGOUT_TEXT = {
  label: '로그아웃',
  failed: '로그아웃하지 못했어요. 다시 눌러 주세요.',
} as const;

export type LogoutButtonProps = {
  /** 로그아웃이 끝났다. 이동(`/login`)은 호출자가 한다. */
  onDone: () => void;
  /** 버튼 글. 권한 없음 화면은 "다른 계정으로 로그인" 을 넘긴다. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function LogoutButton({
  onDone,
  label = LOGOUT_TEXT.label,
  variant = 'ghost',
  size = 'sm',
  className,
}: LogoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const done = await signOut();
    setBusy(false);
    if (done) onDone();
    else setFailed(true);
  }

  return (
    <Button
      variant={variant}
      size={size}
      busy={busy}
      className={className}
      title={failed ? LOGOUT_TEXT.failed : undefined}
      aria-describedby={failed ? 'logout-failed' : undefined}
      onClick={handleClick}
    >
      {label}
      {failed && (
        <span id="logout-failed" className="sr-only">
          {LOGOUT_TEXT.failed}
        </span>
      )}
    </Button>
  );
}
