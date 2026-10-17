// 경로마다 어떤 머리를 그릴지. 화면 자체의 재구성은 다음 PRD 이므로, 지금 화면이 이미 갖는 것
// (첫 화면의 언어 선택, 대화·온보딩·관리자의 자체 머리)과 겹치지 않게 고른다.

export type HeaderVariant = 'public' | 'app' | 'chat';

export type Chrome = {
  variant: HeaderVariant;
  /** 머리에 앱 언어 선택을 둘지(공개용만). */
  showLocale: boolean;
  /** 머리의 도움 알약과 바닥의 위기 띠를 둘지. 관리자 화면만 끈다(관리자는 제품 사용자가 아니다, 디자인 안 §7.7). */
  crisis: boolean;
};

type Rule = { path: string; prefix?: boolean; chrome: Chrome };

const RULES: Rule[] = [
  { path: '/', chrome: { variant: 'public', showLocale: true, crisis: true } },
  { path: '/help', chrome: { variant: 'public', showLocale: true, crisis: true } },
  { path: '/session', chrome: { variant: 'chat', showLocale: false, crisis: true } },
  { path: '/onboarding', chrome: { variant: 'chat', showLocale: false, crisis: true } },
  { path: '/admin', prefix: true, chrome: { variant: 'chat', showLocale: false, crisis: false } },
  { path: '/sessions', prefix: true, chrome: { variant: 'app', showLocale: false, crisis: true } },
  { path: '/settings', prefix: true, chrome: { variant: 'app', showLocale: false, crisis: true } },
];

const FALLBACK: Chrome = { variant: 'public', showLocale: true, crisis: true };

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
