import { Badge } from '@/shared/ui';
import { ACCOUNT_STATE_LABELS, ACCOUNT_STATE_TONES } from '../model/labels';
import { accountState } from '../model/state';
import type { AccountRecord } from '../model/types';

/** 보이는 상태(만료됨 포함)의 배지. */
export function AccountStatusBadge({
  account,
}: {
  account: Pick<AccountRecord, 'status' | 'expired'>;
}) {
  const state = accountState(account);
  return <Badge tone={ACCOUNT_STATE_TONES[state]}>{ACCOUNT_STATE_LABELS[state]}</Badge>;
}
