/**
 * 서버(Route Handler)가 화면에 흘리는 NDJSON 한 줄의 모양. 화면(entities/features)은 이 타입만 가져온다(`import type`).
 */

/** PRD 채팅의 한 줄. `session` 은 Route Handler 가 첫 줄로 직접 보내고, 나머지는 `createStreamParser` 가 만든다. */
export type ChatEvent =
  | { type: 'session'; id: string }
  | { type: 'text_delta'; text: string }
  /** 도구 이름과 파일 경로만 싣는다. 입력 본문(쓴 글, 명령)은 넘기지 않는다. */
  | { type: 'tool_use'; name: string; path?: string }
  /** `PRD_DRAFT: docs/prd/<file>` 줄에서 잡은 basename. 같은 파일이라도 적힐 때마다 온다(화면이 다시 읽는다). */
  | { type: 'draft'; file: string }
  | { type: 'result'; ok: boolean; error?: string }
  | { type: 'error'; message: string };

/** "이슈로 올리기" 의 다섯 단계. */
export type PublishStep = 'push' | 'ledger' | 'commit' | 'git-push' | 'worktree';

export type PublishStatus = 'running' | 'ok' | 'failed';

/** 올리기의 한 줄. `output` 은 그 단계의 stdout+stderr. `push` 가 `ok` 일 때만 `issue` 와 `url` 이 있다. */
export type PublishEvent = {
  step: PublishStep;
  status: PublishStatus;
  output: string;
  issue?: number;
  url?: string;
};

/** 올리기에서 돌리는 명령 하나. 한 단계에 명령이 둘일 수 있다(`commit` 은 `git add` 와 `git commit`). */
export type PublishCommand = { step: PublishStep; command: 'pnpm' | 'git'; args: string[] };
