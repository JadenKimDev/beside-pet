export type NavItem = { href: string; label: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/models', label: '모델' },
  { href: '/conversations', label: '대화' },
  { href: '/accounts', label: '계정' },
  { href: '/dev-notes', label: '개발노트' },
];

/** 지금 경로가 이 탐색의 화면인가(그 아래 경로 포함). */
export function isCurrentNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
