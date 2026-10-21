'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Account, type AccountRecord, listAccounts } from '@/entities/account';
import { IssueAccountDialog } from '@/features/issue-account';
import { Alert, Button, PageTitle } from '@/shared/ui';
import { AccountBoard } from '@/widgets/account-table';
import { useAuthErrorRedirect } from '@/widgets/app-shell';

const ACCOUNTS_TEXT = {
  title: '계정',
  description: '계정을 발급하고 승인, 정지, 만료를 정해요. 대화 내용은 볼 수 없어요.',
  issue: '계정 발급',
  loadFailed: '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  retry: '다시 시도',
  created: (username: string) => `${username} 계정을 만들었어요.`,
} as const;

const NOTICE_MS = 4000;

export function AccountsPage() {
  const handleAuthError = useAuthErrorRedirect();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 이전에 받은 목록은 실패해도 지우지 않는다(화면 안 1절).
  const reload = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
      setLoadFailed(false);
    } catch (error: unknown) {
      if (!handleAuthError(error)) setLoadFailed(true);
    }
  }, [handleAuthError]);

  useEffect(() => {
    void reload();
    return () => clearTimeout(noticeTimer.current);
  }, [reload]);

  function changed() {
    setActionError(null);
    void reload();
  }

  function created(account: AccountRecord) {
    setIssuing(false);
    setNotice(ACCOUNTS_TEXT.created(account.username));
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
    changed();
  }

  return (
    <>
      <PageTitle
        title={ACCOUNTS_TEXT.title}
        description={ACCOUNTS_TEXT.description}
        actions={
          <Button variant="primary" onClick={() => setIssuing(true)}>
            {ACCOUNTS_TEXT.issue}
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        {loadFailed && (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="danger">{ACCOUNTS_TEXT.loadFailed}</Alert>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              {ACCOUNTS_TEXT.retry}
            </Button>
          </div>
        )}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {!(loadFailed && accounts === null) && (
          <AccountBoard
            accounts={accounts}
            onChanged={changed}
            onError={(message) => {
              setActionError(message);
              void reload();
            }}
          />
        )}
      </div>
      <IssueAccountDialog open={issuing} onClose={() => setIssuing(false)} onCreated={created} />
    </>
  );
}
