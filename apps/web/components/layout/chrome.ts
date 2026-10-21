// 경로마다 어떤 머리를 그릴지. 화면 자체의 재구성은 다음 PRD 이므로, 지금 화면이 이미 갖는 것
// (첫 화면의 언어 선택, 대화·온보딩의 자체 머리)과 겹치지 않게 고른다.

export type HeaderVariant = 'public' | 'app' | 'chat';

export type Chrome = {
  variant: HeaderVariant;
  /** 머리에 앱 언어 선택을 둘지(공개용만). */
  showLocale: boolean;
  /** 머리의 도움 알약과 바닥의 위기 띠를 둘지. 대화 웹의 모든 경로가 켠다(관리 화면은 따로 된 운영 화면 앱에 있다). */
  crisis: boolean;
  /**
   * 머리를 화면 위에 붙일지. 붙어야 스크롤돼도 도움 알약이 보인다. 대화 웹의 모든 경로가 붙인다(관리 화면은 따로 된 운영 화면 앱에 있다).
   * 대화 화면의 진행 머리(SessionHeader)는 이 머리 바로 아래에 붙는다.
   */
  stickyHeader: boolean;
  /**
   * 위기 띠를 입력창 아래에 붙여 스크롤과 상관없이 늘 보이게 할지. 말이 쌓이면 바닥의 위기 띠가
   * 문서 끝으로 밀리는 대화 화면만 켠다. 바닥의 위기 띠는 그대로 둔다.
   */
  crisisDock: boolean;
  /**
   * 로그인이 필요한 경로인지. 켜진 경로는 로그인 확인이 끝났는데 로그인 정보가 없으면 첫 화면으로 보낸다(AuthGuard).
   * 첫 화면과 `/help`, 모르는 경로는 끈다. `/help` 는 서버가 내려가 있어도 열려야 해서 로그인 확인조차 하지 않는다.
   */
  protected: boolean;
};

type Rule = { path: string; prefix?: boolean; chrome: Chrome };

const PUBLIC: Chrome = {
  variant: 'public',
  showLocale: true,
  crisis: true,
  stickyHeader: true,
  crisisDock: false,
  protected: false,
};
const APP: Chrome = {
  variant: 'app',
  showLocale: false,
  crisis: true,
  stickyHeader: true,
  crisisDock: false,
  protected: true,
};

const RULES: Rule[] = [
  { path: '/', chrome: PUBLIC },
  { path: '/help', chrome: PUBLIC },
  {
    path: '/session',
    chrome: {
      variant: 'chat',
      showLocale: false,
      crisis: true,
      stickyHeader: true,
      crisisDock: true,
      protected: true,
    },
  },
  {
    path: '/onboarding',
    chrome: {
      variant: 'chat',
      showLocale: false,
      crisis: true,
      stickyHeader: true,
      crisisDock: false,
      protected: true,
    },
  },
  { path: '/sessions', prefix: true, chrome: APP },
  { path: '/settings', prefix: true, chrome: APP },
];

const FALLBACK: Chrome = PUBLIC;

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
