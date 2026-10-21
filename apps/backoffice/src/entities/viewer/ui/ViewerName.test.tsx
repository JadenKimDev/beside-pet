import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ViewerName } from './ViewerName';

describe('ViewerName', () => {
  it('shows the username', () => {
    const html = renderToStaticMarkup(<ViewerName viewer={{ username: 'demo-admin' }} />);
    expect(html).toContain('demo-admin');
  });
});
