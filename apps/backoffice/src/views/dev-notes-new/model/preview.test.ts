import { describe, expect, it } from 'vitest';
import type { PrdDraft } from '@/entities/prd-draft';
import { ApiError } from '@/shared/api';
import {
  NO_PREVIEW,
  previewFailed,
  previewKind,
  previewStarted,
  previewSucceeded,
} from './preview';

const draft = (file: string, body = '# 초안'): PrdDraft => ({
  file,
  body,
  updatedAt: '2026-10-22T01:02:03.000Z',
});

describe('draft preview', () => {
  it('starts with no draft', () => {
    expect(previewKind(NO_PREVIEW)).toBe('empty');
  });

  it('shows loading for a new file, then the body', () => {
    const loading = previewStarted(NO_PREVIEW, 'a.md');
    expect(previewKind(loading)).toBe('loading');
    const ready = previewSucceeded(loading, 'a.md', draft('a.md'));
    expect(previewKind(ready)).toBe('ready');
    expect(ready.draft?.body).toBe('# 초안');
  });

  it('keeps the shown body while the same file is read again', () => {
    const ready = previewSucceeded(previewStarted(NO_PREVIEW, 'a.md'), 'a.md', draft('a.md'));
    const again = previewStarted(ready, 'a.md');
    expect(previewKind(again)).toBe('ready');
    expect(again.loading).toBe(true);
    expect(again.draft?.file).toBe('a.md');
  });

  it('clears the old body when another file is read', () => {
    const ready = previewSucceeded(previewStarted(NO_PREVIEW, 'a.md'), 'a.md', draft('a.md'));
    const other = previewStarted(ready, 'b.md');
    expect(previewKind(other)).toBe('loading');
    expect(other.draft).toBeNull();
  });

  it('drops late answers for a file that is no longer shown', () => {
    const other = previewStarted(previewStarted(NO_PREVIEW, 'a.md'), 'b.md');
    expect(previewSucceeded(other, 'a.md', draft('a.md'))).toBe(other);
    expect(previewFailed(other, 'a.md', new Error('x'))).toBe(other);
  });

  it('treats 404 as no draft yet', () => {
    const missing = previewFailed(
      previewStarted(NO_PREVIEW, 'a.md'),
      'a.md',
      new ApiError(404, '없음'),
    );
    expect(previewKind(missing)).toBe('empty');
  });

  it('shows a failure for other errors and keeps the body it had', () => {
    const failed = previewFailed(previewStarted(NO_PREVIEW, 'a.md'), 'a.md', new Error('x'));
    expect(previewKind(failed)).toBe('failed');
    const ready = previewSucceeded(previewStarted(NO_PREVIEW, 'a.md'), 'a.md', draft('a.md'));
    const kept = previewFailed(previewStarted(ready, 'a.md'), 'a.md', new ApiError(500, 'x'));
    expect(previewKind(kept)).toBe('ready');
    expect(kept.failed).toBe(true);
  });
});
