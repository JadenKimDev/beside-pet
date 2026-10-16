import { describe, expect, it } from 'vitest';
import { chromeFor } from './chrome';

describe('chromeFor', () => {
  it('첫 화면과 /help 는 공개용 머리다', () => {
    expect(chromeFor('/').variant).toBe('public');
    expect(chromeFor('/help').variant).toBe('public');
  });

  it('첫 화면은 화면이 자기 언어 선택을 가지므로 머리의 언어 선택을 감춘다', () => {
    expect(chromeFor('/').showLocale).toBe(false);
    expect(chromeFor('/help').showLocale).toBe(true);
  });

  it('대화와 온보딩은 대화용 머리다(화면이 자기 머리를 갖는다)', () => {
    expect(chromeFor('/session').variant).toBe('chat');
    expect(chromeFor('/onboarding').variant).toBe('chat');
  });

  it('목록, 리포트, 설정은 앱용 머리다', () => {
    expect(chromeFor('/sessions').variant).toBe('app');
    expect(chromeFor('/sessions/abc/report').variant).toBe('app');
    expect(chromeFor('/settings').variant).toBe('app');
  });

  it('/sessions 를 /session 으로 잘못 잡지 않고, 끝의 / 와 쿼리 없는 경로를 같게 본다', () => {
    expect(chromeFor('/sessions').variant).toBe('app');
    expect(chromeFor('/session/').variant).toBe('chat');
    expect(chromeFor('/help/').variant).toBe('public');
  });

  it('모르는 경로와 null 은 공개용 머리다(도움 알약은 어느 변형에나 있다)', () => {
    expect(chromeFor(null).variant).toBe('public');
    expect(chromeFor('/nowhere').variant).toBe('public');
  });
});
