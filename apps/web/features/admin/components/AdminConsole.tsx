'use client';

/**
 * AdminConsole — the body of /admin under the title: the four counts, search and
 * status filter, the account list, and the add-account card. Counts and filters are
 * derived from the list the server returns (admin.view.ts). Delete and revoke go
 * through the confirm modal; the store does the call and refreshes the list.
 */
import { useState } from 'react';
import {
  Alert,
  Card,
  EmptyState,
  Icon,
  Modal,
  Segmented,
  Skeleton,
  SkeletonArea,
} from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import { useAdminStore } from '../admin.store';
import type { Account } from '../admin.types';
import {
  type AccountFilter,
  COUNTED_STATES,
  type CountedState,
  countByState,
  visibleAccounts,
} from '../admin.view';
import { AccountTable, type ConfirmKind, stateLabel } from './AccountTable';
import { AddAccountForm } from './AddAccountForm';

type Pending = { kind: ConfirmKind; account: Account };

export function AdminConsole() {
  const t = useTranslations().admin;
  const accounts = useAdminStore((s) => s.accounts);
  const loaded = useAdminStore((s) => s.loaded);
  const busy = useAdminStore((s) => s.busy);
  const error = useAdminStore((s) => s.error);
  const softDelete = useAdminStore((s) => s.softDelete);
  const revoke = useAdminStore((s) => s.revoke);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const onConfirm = async () => {
    if (!pending) return;
    const { kind, account } = pending;
    await (kind === 'delete' ? softDelete(account.id) : revoke(account.id));
    setPending(null);
  };

  if (!loaded) {
    return (
      <SkeletonArea label={t.loading} className="grid gap-6">
        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          {COUNTED_STATES.map((state) => (
            <Skeleton key={state} className="h-[84px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-pill" />
        <Skeleton className="h-64 rounded-lg" />
      </SkeletonArea>
    );
  }

  const counts = countByState(accounts);
  const visible = visibleAccounts(accounts, filter, query);
  const filterOptions: { value: AccountFilter; label: string }[] = [
    { value: 'all', label: t.filterAll },
    ...COUNTED_STATES.map((state) => ({ value: state, label: stateLabel(state, t) })),
  ];

  return (
    <div className="grid gap-6">
      {error && <Alert>{error}</Alert>}

      <ul
        aria-label={t.countsLabel}
        className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-sm:grid-cols-2"
      >
        {COUNTED_STATES.map((state) => (
          <CountCard key={state} state={state} label={stateLabel(state, t)} value={counts[state]} />
        ))}
      </ul>

      {accounts.length === 0 ? (
        <EmptyState icon={<Icon name="user" />} title={t.empty} headingLevel={2} />
      ) : (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[240px] flex-1">
              <span className="sr-only">{t.search}</span>
              <input
                type="search"
                value={query}
                placeholder={t.search}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-pill border border-border-strong bg-surface px-4 text-[15px] text-fg placeholder:text-fg-muted focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_20%,transparent)] focus:outline-none"
              />
            </label>
            <Segmented
              label={t.filterLabel}
              options={filterOptions}
              value={filter}
              onChange={setFilter}
            />
          </div>
          {visible.length === 0 ? (
            <p className="m-0 py-8 text-center text-fg-muted">{t.noMatch}</p>
          ) : (
            <AccountTable
              accounts={visible}
              onAsk={(kind, account) => setPending({ kind, account })}
            />
          )}
        </section>
      )}

      <Card as="section" aria-labelledby="admin-add-title" className="grid gap-4">
        <h2 id="admin-add-title" className="m-0 text-h3">
          {t.addTitle}
        </h2>
        <AddAccountForm />
      </Card>

      <Modal
        open={pending !== null}
        tone="danger"
        icon={<Icon name={pending?.kind === 'revoke' ? 'lock' : 'trash'} />}
        title={
          pending
            ? pending.kind === 'delete'
              ? t.confirmDeleteTitle(pending.account.username)
              : t.confirmRevokeTitle(pending.account.username)
            : ''
        }
        body={pending?.kind === 'revoke' ? t.confirmRevokeBody : t.confirmDeleteBody}
        cancelLabel={t.cancel}
        confirmLabel={pending?.kind === 'revoke' ? t.revoke : t.delete}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void onConfirm()}
      />
    </div>
  );
}

function CountCard({ state, label, value }: { state: CountedState; label: string; value: number }) {
  return (
    <li
      data-count={state}
      className="grid gap-1 rounded-lg border border-border bg-surface px-5 py-4"
    >
      <span className="text-small text-fg-muted">{label}</span>
      <span data-count-value className="text-h1 font-semibold tabular-nums text-fg">
        {value}
      </span>
    </li>
  );
}
