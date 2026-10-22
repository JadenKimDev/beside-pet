import { describe, expect, it } from 'vitest';
import { isSendKey } from './keys';

const key = (overrides: Partial<Parameters<typeof isSendKey>[0]> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  ...overrides,
});

describe('isSendKey', () => {
  it('sends on plain Enter', () => {
    expect(isSendKey(key())).toBe(true);
  });

  it('keeps Shift+Enter as a line break', () => {
    expect(isSendKey(key({ shiftKey: true }))).toBe(false);
  });

  it('does not send while an IME composition is open', () => {
    expect(isSendKey(key({ isComposing: true }))).toBe(false);
    // Safari 는 조합을 끝내는 Enter 에서 isComposing 이 false 이고 keyCode 가 229 다.
    expect(isSendKey(key({ keyCode: 229 }))).toBe(false);
  });

  it('ignores other keys', () => {
    expect(isSendKey(key({ key: 'a', keyCode: 65 }))).toBe(false);
  });
});
