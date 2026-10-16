// /help 는 인증 없이, 서버가 내려가 있어도 열린다(apps/web/CLAUDE.md "공개 경로").
// 화면을 이루는 소스가 API·인증 상태를 가져오지 않는지 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCES = ['./page.tsx', '../../features/safety/components/HelpScreen.tsx'];
const FORBIDDEN = [/@\/lib\/api/, /\bfetch\(/, /auth\.store/, /useAuthStore/, /session\.store/];

describe('/help 는 공개, 정적', () => {
  for (const path of SOURCES) {
    it(`${path} 는 서버 호출과 인증 상태를 쓰지 않는다`, () => {
      const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
      for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern);
    });
  }
});
