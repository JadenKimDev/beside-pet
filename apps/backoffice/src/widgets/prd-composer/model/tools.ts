import type { PrdChatTool } from '@/features/prd-chat';

const TOOL_VERBS: Readonly<Record<string, string>> = {
  Read: '읽음',
  Write: '씀',
  Edit: '고침',
  Grep: '찾음',
  Glob: '찾음',
  Bash: '실행',
};

/** assistant 가 쓴 도구 한 줄. "읽음 docs/adr/0001.md" 처럼 동사와 경로만. */
export function toolLine(tool: PrdChatTool): string {
  const verb = TOOL_VERBS[tool.name] ?? tool.name;
  return tool.path ? `${verb} ${tool.path}` : verb;
}
