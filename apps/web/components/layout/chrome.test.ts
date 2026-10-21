import { describe, expect, it } from 'vitest';
import { chromeFor } from './chrome';

describe('chromeFor', () => {
  it('첫 화면과 /help 는 공개용 머리다', () => {
    expect(chromeFor('/').variant).toBe('public');
    expect(chromeFor('/help').variant).toBe('public');
  });

  it('첫 화면과 /help 의 머리에 언어 선택이 있다', () => {
    expect(chromeFor('/').showLocale).toBe(true);
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

  it('도움 알약과 위기 띠는 모든 경로와 모르는 경로에서 켠다', () => {
    expect(chromeFor('/session').crisis).toBe(true);
    expect(chromeFor('/sessions').crisis).toBe(true);
    expect(chromeFor('/help').crisis).toBe(true);
    expect(chromeFor(null).crisis).toBe(true);
  });

  it('모르는 경로와 null 은 공개용 머리다(도움 알약은 어느 변형에나 있다)', () => {
    expect(chromeFor(null).variant).toBe('public');
    expect(chromeFor('/nowhere').variant).toBe('public');
  });

  it('모든 경로의 머리는 스크롤돼도 붙어 있다(도움 알약이 늘 보인다). 대화 화면도 붙는다', () => {
    for (const path of [
      '/',
      '/help',
      '/session',
      '/onboarding',
      '/sessions',
      '/sessions/abc',
      '/settings',
    ]) {
      expect(chromeFor(path).stickyHeader).toBe(true);
    }
    expect(chromeFor(null).stickyHeader).toBe(true);
    expect(chromeFor('/nowhere').stickyHeader).toBe(true);
  });

  it('위기 띠를 입력창 아래에 붙여 늘 보이게 하는 것은 대화 화면뿐이다', () => {
    expect(chromeFor('/session').crisisDock).toBe(true);
    for (const path of [
      '/',
      '/help',
      '/onboarding',
      '/sessions',
      '/sessions/abc',
      '/settings',
      '/nowhere',
    ]) {
      expect(chromeFor(path).crisisDock).toBe(false);
    }
    expect(chromeFor(null).crisisDock).toBe(false);
  });
});

describe('chromeFor protected', () => {
  it('첫 화면과 /help 는 로그인 없이 열린다', () => {
    expect(chromeFor('/').protected).toBe(false);
    expect(chromeFor('/help').protected).toBe(false);
    expect(chromeFor('/help/').protected).toBe(false);
  });

  it('대화, 온보딩, 목록, 리포트, 설정은 로그인이 필요하다', () => {
    for (const path of [
      '/session',
      '/session/',
      '/onboarding',
      '/sessions',
      '/sessions/abc',
      '/sessions/abc/report',
      '/settings',
      '/settings/theme',
    ]) {
      expect(chromeFor(path).protected).toBe(true);
    }
  });

  it('모르는 경로와 null 은 공개다', () => {
    expect(chromeFor('/nowhere').protected).toBe(false);
    expect(chromeFor('/helpdesk').protected).toBe(false);
    expect(chromeFor(null).protected).toBe(false);
  });
});
