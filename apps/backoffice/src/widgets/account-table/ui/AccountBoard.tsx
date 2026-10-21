'use client';

import { useState } from 'react';
import type { Account, AccountFilter } from '@/entities/account';
import type { ModerateAccountOptions } from '@/features/moderate-account';
import { cn, formatCount } from '@/shared/lib';
import { EmptyState, Input, Segmented, Select, Skeleton } from '@/shared/ui';
import {
  stateFilterOptions,
  summaryCards,
  ACCOUNT_TABLE_TEXT as T,
  toAccountFilter,
  visibleAccounts,
} from '../model/view';
import { AccountRows } from './AccountRows';

export type AccountBoardProps = ModerateAccountOptions & {
  /** 받은 목록. 처음 받기 전에는 null 이고 자리 블록을 보인다. */
  accounts: readonly Account[] | null;
};

const FILTER_OPTIONS = stateFilterOptions();

function LoadingBoard() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{T.loading}</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-20" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((key) => (
        <Skeleton key={key} className="h-12" />
      ))}
    </div>
  );
}

/** 계정 화면의 집계 줄, 거르기 줄, 표(좁은 화면은 카드). 목록 받기와 발급은 views 가 한다. */
export function AccountBoard({ accounts, onChanged, onError }: AccountBoardProps) {
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [query, setQuery] = useState('');

  if (accounts === null) return <LoadingBoard />;
  if (accounts.length === 0) return <EmptyState title={T.empty} description={T.emptyHint} />;

  const rows = visibleAccounts(accounts, filter, query);

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label={T.summaryLabel} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards(accounts).map((card) => {
          const selected = filter === card.state;
          return (
            <li key={card.state}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(selected ? 'all' : card.state)}
                className={cn(
                  'flex w-full flex-col items-start gap-1 rounded-lg border bg-surface p-3.5 text-left md:p-4',
                  selected ? 'border-accent' : 'border-border hover:bg-bg-sunk',
                )}
              >
                <span className="text-sm text-fg-muted">{card.label}</span>
                <span className="text-2xl font-semibold tabular-nums text-fg">
                  {formatCount(card.count)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          type="search"
          aria-label={T.searchLabel}
          placeholder={T.searchLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="md:max-w-xs"
        />
        <div className="hidden md:block">
          <Segmented
            label={T.stateLabel}
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-fg md:hidden">
          <label htmlFor="account-state-filter" className="shrink-0">
            {T.stateLabel}
          </label>
          <Select
            id="account-state-filter"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={(event) => setFilter(toAccountFilter(event.target.value))}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={T.noMatch} />
      ) : (
        <AccountRows accounts={rows} onChanged={onChanged} onError={onError} />
      )}
    </div>
  );
}
