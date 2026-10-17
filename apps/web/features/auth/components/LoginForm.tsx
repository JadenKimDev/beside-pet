'use client';

/**
 * LoginForm — 첫 화면 카드의 로그인. 실패하면 폼 위에 오류 알림, 비밀번호 칸은 danger 테두리이고
 * 입력은 지우지 않는다. 로그인 중에는 버튼에 스피너를 두고 입력을 막는다.
 * 유스케이스는 auth.store 에 있다. 로그인 뒤 어디로 갈지는 페이지가 정한다(principal 을 보고).
 */
import { type FormEvent, useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { CardHead, SwitchLine } from './card-parts';

export function LoginForm({ onRegister }: { onRegister: () => void }) {
  const t = useTranslations().auth;
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const failed = Boolean(error) && !busy;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void login(username.trim(), password);
  };

  return (
    <>
      <CardHead title={t.welcome} lead={t.subtitle} />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {failed && <Alert>{t.loginFailed}</Alert>}
        <Field label={t.username}>
          {(control) => (
            <Input
              {...control}
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          )}
        </Field>
        <Field label={t.password}>
          {(control) => (
            <Input
              {...control}
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              invalid={failed}
              disabled={busy}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          block
          busy={busy}
          aria-label={busy ? t.signingIn : undefined}
          disabled={!username.trim() || !password}
        >
          {t.submit}
        </Button>
      </form>
      <SwitchLine lead={t.noAccount} action={t.registerLink} onClick={onRegister} />
    </>
  );
}
