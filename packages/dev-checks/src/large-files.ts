// 레포 규칙: 파일 크기는 규칙이 아니라 신호다. 600줄을 넘는 제품 파일을 돌려주고, 책임이 둘인지는 검수가
// 본다. 테스트 파일(`tests/` 아래, `tests.rs`, `*_tests.rs`, `*.test.ts(x)`)은 세지 않는다. 줄 수는 부르는
// 쪽이 센다.

export type FileLength = { path: string; lines: number };

/** 테스트 파일인가: `tests/` 아래, `tests.rs`, `*_tests.rs`, `*.test.*`. */
export function isTestPath(path: string): boolean {
  if (/(^|\/)tests\//.test(path)) return true;
  if (/(^|\/|_)tests\.rs$/.test(path)) return true;
  return /\.test\.[^/]+$/.test(path);
}

/** `limit` 줄을 넘는 제품 파일. 받은 차례대로다. */
export function largeFiles(files: FileLength[], limit = 600): FileLength[] {
  return files.filter((file) => file.lines > limit && !isTestPath(file.path));
}
