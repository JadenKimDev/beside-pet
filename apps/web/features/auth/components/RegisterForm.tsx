'use client';

/**
 * RegisterForm — 공개 계정 신청(아이디, 비밀번호, 소속). 승인을 기다리는 계정을 만든다.
 * 대화 언어는 받지 않는다: 신청 API 가 그 칸을 받지 않고(ADR-0015), 온보딩의 첫 질문이 묻는다.
 * 유스케이스는 auth.store 에 있다. 완료 안내는 RegisterDone 이 맡는다.
 */
import { type FormEvent, useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { useTranslations } from '@/i18n/I18nProvider';
import { CardHead, SwitchLine } from './card-parts';

/** 서버가 받는 가장 짧은 비밀번호. */
const MIN_PASSWORD = 8;

export function RegisterForm({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useTranslations().auth;
  const register = useAuthStore((s) => s.register);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void register(username.trim(), password, company.trim());
  };

  return (
    <>
      <CardHead title={t.registerTitle} lead={t.registerSubtitle} />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && !busy && <Alert>{error}</Alert>}
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
        <Field label={t.password} hint={t.passwordHint}>
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
        <Field label={t.company} hint={t.companyHint}>
          {(control) => (
            <Input
              {...control}
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              autoComplete="organization"
              disabled={busy}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          block
          busy={busy}
          aria-label={busy ? t.registering : undefined}
          disabled={!username.trim() || password.length < MIN_PASSWORD || !company.trim()}
        >
          {t.registerSubmit}
        </Button>
      </form>
      <SwitchLine action={t.backToLogin} onClick={onBackToLogin} />
    </>
  );
}
