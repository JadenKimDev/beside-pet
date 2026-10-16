// 경로마다 어떤 머리를 그릴지. 화면 자체의 재구성은 다음 PRD 이므로, 지금 화면이 이미 갖는 것
// (첫 화면의 언어 선택, 대화·온보딩·관리자의 자체 머리)과 겹치지 않게 고른다.

export type HeaderVariant = 'public' | 'app' | 'chat';

export type Chrome = {
  variant: HeaderVariant;
  /** 머리에 앱 언어 선택을 둘지(공개용만). */
  showLocale: boolean;
};

type Rule = { path: string; prefix?: boolean; chrome: Chrome };

const RULES: Rule[] = [
  { path: '/', chrome: { variant: 'public', showLocale: false } },
  { path: '/help', chrome: { variant: 'public', showLocale: true } },
  { path: '/session', chrome: { variant: 'chat', showLocale: false } },
  { path: '/onboarding', chrome: { variant: 'chat', showLocale: false } },
  { path: '/admin', prefix: true, chrome: { variant: 'chat', showLocale: false } },
  { path: '/sessions', prefix: true, chrome: { variant: 'app', showLocale: false } },
  { path: '/settings', prefix: true, chrome: { variant: 'app', showLocale: false } },
];

const FALLBACK: Chrome = { variant: 'public', showLocale: true };

function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function chromeFor(pathname: string | null): Chrome {
  if (!pathname) return FALLBACK;
  const path = normalize(pathname);
  const rule = RULES.find(
    (candidate) =>
      path === candidate.path || (candidate.prefix && path.startsWith(`${candidate.path}/`)),
  );
  return rule?.chrome ?? FALLBACK;
}
