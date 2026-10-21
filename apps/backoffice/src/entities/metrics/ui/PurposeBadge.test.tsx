import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PurposeBadge } from './PurposeBadge';

describe('PurposeBadge', () => {
  it('shows the Korean purpose label, crisis in the warning tone', () => {
    expect(renderToStaticMarkup(<PurposeBadge purpose="reply" />)).toContain('발화');
    expect(renderToStaticMarkup(<PurposeBadge purpose="report" />)).toContain('리포트');
    const crisis = renderToStaticMarkup(<PurposeBadge purpose="crisis" />);
    expect(crisis).toContain('위기 판정');
    expect(crisis).toContain('bg-warning-soft');
  });
});
