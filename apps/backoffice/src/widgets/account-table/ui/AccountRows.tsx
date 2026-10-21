'use client';

import { type Account, AccountStatusBadge, accountState, ROLE_LABELS } from '@/entities/account';
import { AccountActions, type ModerateAccountOptions } from '@/features/moderate-account';
import { cn, formatCount } from '@/shared/lib';
import { Badge, Card, Table, TBody, Td, THead, Th, Tr } from '@/shared/ui';
import {
  formatExpiry,
  formatLocalTime,
  relativeTime,
  ACCOUNT_TABLE_TEXT as T,
} from '../model/view';

export type AccountRowsProps = ModerateAccountOptions & { accounts: readonly Account[] };

function When({ iso }: { iso: string | undefined }) {
  return <span title={iso ? formatLocalTime(iso) : undefined}>{relativeTime(iso)}</span>;
}

function Expiry({ account }: { account: Account }) {
  return (
    <span className={cn(accountState(account) === 'expired' && 'text-danger')}>
      {formatExpiry(account.expiresAt)}
    </span>
  );
}

function Name({ account }: { account: Account }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium" title={account.username}>
        {account.username}
      </span>
      {account.role === 'admin' && <Badge tone="neutral">{ROLE_LABELS.admin}</Badge>}
    </span>
  );
}

/** 768px 이상: 표. 대화 본문, 리포트, 추모 편지 칸은 없다(서버도 주지 않는다). */
function WideTable({ accounts, onChanged, onError }: AccountRowsProps) {
  return (
    <Table>
      <THead>
        <tr>
          <Th>{T.username}</Th>
          <Th>{T.company}</Th>
          <Th>{T.state}</Th>
          <Th className="text-right">{T.sessionCount}</Th>
          <Th>{T.lastActive}</Th>
          <Th>{T.lastLogin}</Th>
          <Th>{T.expiry}</Th>
          <Th>{T.actions}</Th>
        </tr>
      </THead>
      <TBody>
        {accounts.map((account) => (
          <Tr
            key={account.id}
            className={cn(account.status === 'deleted' && '[&_td]:text-fg-muted')}
          >
            <Td className="max-w-48">
              <Name account={account} />
            </Td>
            <Td className="max-w-48 truncate" title={account.company}>
              {account.company}
            </Td>
            <Td>
              <AccountStatusBadge account={account} />
            </Td>
            <Td className="text-right">{formatCount(account.sessionCount)}</Td>
            <Td className="whitespace-nowrap">
              <When iso={account.lastActiveAt} />
            </Td>
            <Td className="whitespace-nowrap">
              <When iso={account.lastLoginAt} />
            </Td>
            <Td className="whitespace-nowrap">
              <Expiry account={account} />
            </Td>
            <Td>
              <AccountActions account={account} onChanged={onChanged} onError={onError} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/** 768px 미만: 행마다 카드 하나(가로 스크롤 표를 두지 않는다). */
function NarrowCards({ accounts, onChanged, onError }: AccountRowsProps) {
  return (
    <ul className="flex flex-col gap-3">
      {accounts.map((account) => (
        <li key={account.id}>
          <Card className={cn('p-3.5', account.status === 'deleted' && 'text-fg-muted')}>
            <div className="flex items-center justify-between gap-2">
              <Name account={account} />
              <AccountStatusBadge account={account} />
            </div>
            <p className="mt-1 truncate text-sm text-fg-muted" title={account.company}>
              {account.company}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm tabular-nums">
              {[
                [T.sessionCount, formatCount(account.sessionCount)],
                [T.lastActive, <When key="a" iso={account.lastActiveAt} />],
                [T.lastLogin, <When key="l" iso={account.lastLoginAt} />],
                [T.expiry, <Expiry key="e" account={account} />],
              ].map(([term, value]) => (
                <div key={String(term)} className="min-w-0">
                  <dt className="text-xs text-fg-muted">{term}</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <AccountActions account={account} onChanged={onChanged} onError={onError} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function AccountRows(props: AccountRowsProps) {
  return (
    <>
      <div className="hidden md:block">
        <WideTable {...props} />
      </div>
      <div className="md:hidden">
        <NarrowCards {...props} />
      </div>
    </>
  );
}
