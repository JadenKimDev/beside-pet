// /showcase 는 인증 없이, 서버가 내려가 있어도 열린다(apps/web/CLAUDE.md "공개 경로", ADR-0029).
// 화면을 이루는 소스가 API·fetch·인증 상태를 가져오지 않는지 본다. 자료는 빌드 때 복사된
// public/showcase/ 의 정적 파일뿐이다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCES = [
  './page.tsx',
  '../../features/showcase/ui/ShowcaseScreen.tsx',
  '../../features/showcase/ui/WalkthroughStep.tsx',
  '../../features/showcase/ui/DevNotesList.tsx',
];
const FORBIDDEN = [
  /@\/lib\/api/,
  /\bfetch\(/,
  /auth\.store/,
  /useAuthStore/,
  /session\.store/,
  /AuthGuard/,
];

describe('/showcase 는 공개, 정적', () => {
  for (const path of SOURCES) {
    it(`${path} 는 서버 호출과 인증 상태를 쓰지 않는다`, () => {
      const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
      for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern);
    });
  }

  it('page.tsx 는 showcase 자료를 읽어 화면에 넘긴다', () => {
    const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/loadTranscript\(/);
    expect(source).toMatch(/loadDevNotes\(/);
  });

  it('화면은 개발 기록의 이슈 번호와 GitHub 링크를 보이지 않는다', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../features/showcase/ui/DevNotesList.tsx', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/\.issue\b/);
    expect(source).not.toMatch(/github\.com/);
  });
});
