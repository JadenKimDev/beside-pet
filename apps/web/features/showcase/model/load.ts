// 서버 컴포넌트 전용 읽기 함수. 빌드 때 복사된 public/showcase/ 의 JSON 을 파일로 읽는다.
// 서버 호출, fetch, 인증 스토어를 쓰지 않는다. 화면은 이미지와 자료를 경로 문자열로만 가리킨다
// (public/showcase/ 는 git 이 무시하므로 import 하지 않는다).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevNote, DevNotes, Transcript } from './types';

/** 웹에서 쇼케이스 자료가 놓이는 URL 의 앞부분. */
export const SHOWCASE_BASE_URL = '/showcase';

function publicShowcaseDir(): string {
  return join(process.cwd(), 'public', 'showcase');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** 스크린샷 파일 이름을 웹 경로로 바꾼다. 예: "08-greeting.webp" → "/showcase/pomo/08-greeting.webp". */
export function screenshotPath(file: string): string {
  return `${SHOWCASE_BASE_URL}/pomo/${file}`;
}

export function loadTranscript(dir: string = publicShowcaseDir()): Transcript {
  return readJson<Transcript>(join(dir, 'pomo', 'transcript.json'));
}

/** 개발 기록을 최근 날짜부터. 같은 날짜는 파일의 순서를 지킨다(Array.prototype.sort 는 안정 정렬). */
export function sortDevNotes(entries: readonly DevNote[]): DevNote[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function loadDevNotes(dir: string = publicShowcaseDir()): DevNote[] {
  return sortDevNotes(readJson<DevNotes>(join(dir, 'dev-notes.json')).entries);
}
