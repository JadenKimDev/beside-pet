import { cookies } from 'next/headers';
import { HelpScreen } from '@/features/safety/components/HelpScreen';
import { resolveTheme, THEME_COOKIE } from '@/theme/config';

/**
 * /help — 도움받을 수 있는 곳. 공개 경로: 인증 가드에 넣지 않고 서버 호출을 두지 않는다.
 * API 가 내려가 있어도 열린다. 쿠키는 삽화의 테마 판을 고르는 데만 읽는다.
 */
export default async function HelpPage() {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <HelpScreen theme={theme} />;
}
