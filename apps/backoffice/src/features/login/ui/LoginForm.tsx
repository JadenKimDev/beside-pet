'use client';

import { type FormEvent, useState } from 'react';
import { useStore } from 'zustand';
import type { AccountRecord } from '@/entities/account';
import { Alert, Button, Field, Input } from '@/shared/ui';
import { createLoginStore, LOGIN_TEXT } from '../model/login';

export type LoginFormProps = {
  /** 로그인에 성공했다. 관리자 판정과 이동은 호출자(views)가 한다. */
  onSuccess: (account: AccountRecord) => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [store] = useState(createLoginStore);
  const { username, password, fieldErrors, busy, error, setField, submit } = useStore(store);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = await submit();
    if (account) onSuccess(account);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label={LOGIN_TEXT.username} htmlFor="login-username" error={fieldErrors.username}>
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          value={username}
          aria-invalid={fieldErrors.username ? true : undefined}
          onChange={(event) => setField('username', event.target.value)}
        />
      </Field>
      <Field label={LOGIN_TEXT.password} htmlFor="login-password" error={fieldErrors.password}>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          aria-invalid={fieldErrors.password ? true : undefined}
          onChange={(event) => setField('password', event.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        {busy ? LOGIN_TEXT.submitting : LOGIN_TEXT.submit}
      </Button>
    </form>
  );
}
