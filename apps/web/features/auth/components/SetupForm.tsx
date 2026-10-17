'use client';

/**
 * SetupForm — 첫 관리자 만들기(백엔드가 setup 대기라고 하는 동안 로그인 대신 보인다).
 * 운영자가 서버 시작 로그에 한 번 나온 토큰을 붙여 넣고 관리자 계정을 정한다. env 파일에는 아무것도 없다.
 * 토큰 칸은 고정폭 글꼴. 유스케이스는 auth.store 에 있다.
 */
import { type FormEvent, useState } from 'react';
import { Alert, Button, Field, Icon, Input } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { CardHead } from './card-parts';

export function SetupForm() {
  const t = useTranslations().auth;
  const setup = useAuthStore((s) => s.setup);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void setup(token.trim(), username.trim(), password);
  };

  return (
    <>
      <CardHead
        title={t.setupTitle}
        lead={t.setupSubtitle}
        badge={
          <span className="mb-3 inline-grid size-10 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-5">
            <Icon name="shield" />
          </span>
        }
      />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && !busy && <Alert>{error}</Alert>}
        <Field label={t.setupToken} hint={t.setupTokenHint}>
          {(control) => (
            <Input
              {...control}
              name="token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              disabled={busy}
            />
          )}
        </Field>
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
              autoComplete="new-password"
              disabled={busy}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          block
          busy={busy}
          aria-label={busy ? t.settingUp : undefined}
          disabled={!token.trim() || !username.trim() || !password}
        >
          {t.setupSubmit}
        </Button>
      </form>
    </>
  );
}
