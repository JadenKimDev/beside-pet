import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_STATE_LABELS } from '../model/labels';
import { AccountStatusBadge } from './AccountStatusBadge';

describe('AccountStatusBadge', () => {
  it('shows the Korean label of the shown state with its tone', () => {
    const expired = renderToStaticMarkup(
      <AccountStatusBadge account={{ status: 'active', expired: true }} />,
    );
    expect(expired).toContain('만료됨');
    expect(expired).toContain('bg-bg-sunk');

    const pending = renderToStaticMarkup(
      <AccountStatusBadge account={{ status: 'pending', expired: false }} />,
    );
    expect(pending).toContain('승인 대기');
    expect(pending).toContain('bg-warning-soft');

    const revoked = renderToStaticMarkup(
      <AccountStatusBadge account={{ status: 'revoked', expired: false }} />,
    );
    expect(revoked).toContain('bg-danger-soft');
  });

  it('labels every shown state', () => {
    expect(ACCOUNT_STATE_LABELS).toEqual({
      pending: '승인 대기',
      active: '활성',
      expired: '만료됨',
      revoked: '정지됨',
      deleted: '삭제됨',
    });
  });
});
