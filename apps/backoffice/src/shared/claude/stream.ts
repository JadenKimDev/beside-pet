import type { ChatEvent } from './events';
import { isDraftFileName } from './path';

// stream-json 의 줄 가운데 읽는 칸만 적는다(2026-10-22 실측). 나머지 칸은 보지 않는다.
type ToolInput = { file_path?: string; notebook_path?: string; path?: string };
type ContentBlock = { type?: string; name?: string; input?: ToolInput };
type StreamEvent = { type?: string; delta?: { type?: string; text?: string } };
type StreamLine = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  event?: StreamEvent;
  message?: { content?: ContentBlock[] };
  parent_tool_use_id?: string | null;
};

const DRAFT_LINE = /^\s*PRD_DRAFT:\s*`?docs\/prd\/([^\s`]+)`?\s*$/;
const ERROR_MAX = 500;

function readLine(line: string): StreamLine | null {
  try {
    const value = JSON.parse(line) as StreamLine | null;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function draftFrom(line: string): ChatEvent[] {
  const file = DRAFT_LINE.exec(line)?.[1];
  return file !== undefined && isDraftFileName(file) ? [{ type: 'draft', file }] : [];
}

function toolUses(content: ContentBlock[] | undefined): ChatEvent[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): ChatEvent[] => {
    if (block?.type !== 'tool_use' || typeof block.name !== 'string') return [];
    const input = block.input ?? {};
    const path = [input.file_path, input.notebook_path, input.path].find(
      (p) => typeof p === 'string',
    );
    return [
      path === undefined
        ? { type: 'tool_use', name: block.name }
        : { type: 'tool_use', name: block.name, path },
    ];
  });
}

function resultEvent(raw: StreamLine): ChatEvent {
  if (raw.subtype === 'success' && raw.is_error !== true) return { type: 'result', ok: true };
  const reason =
    raw.is_error === true && typeof raw.result === 'string' && raw.result
      ? raw.result
      : raw.subtype;
  return { type: 'result', ok: false, error: (reason ?? 'error').slice(0, ERROR_MAX) };
}

/** stream-json 을 줄마다 받는 상태 있는 파서. `PRD_DRAFT:` 줄이 text_delta 조각에 걸쳐 와도 잡는다. */
export type StreamParser = {
  push(line: string): ChatEvent[];
  /** 스트림이 끝났을 때 남은 줄을 본다(`result` 없이 프로세스가 끝난 경우). */
  end(): ChatEvent[];
};

/**
 * `claude -p --output-format stream-json --include-partial-messages --verbose` 의 stdout 을 한 줄씩 받아 화면 이벤트로 바꾼다.
 * - `stream_event` 의 `text_delta` → `text_delta`. 글 블록이 끝나면(`content_block_stop`) 남은 줄도 `PRD_DRAFT:` 인지 본다.
 * - `assistant` 메시지의 `tool_use` 블록 → `tool_use`(이름과 경로만). 블록 시작 이벤트는 입력이 비어 있어 쓰지 않는다.
 * - `result` → `result`. `system`, `rate_limit_event`, 하위 에이전트(`parent_tool_use_id`)의 줄, JSON 이 아닌 줄은 빈 배열.
 */
export function createStreamParser(): StreamParser {
  let pending = '';

  const flush = (): ChatEvent[] => {
    const rest = pending;
    pending = '';
    return draftFrom(rest);
  };

  const text = (chunk: string): ChatEvent[] => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop() ?? '';
    return [{ type: 'text_delta', text: chunk }, ...lines.flatMap(draftFrom)];
  };

  return {
    push(line) {
      const raw = readLine(line);
      if (raw === null || typeof raw.parent_tool_use_id === 'string') return [];
      if (raw.type === 'result') return [...flush(), resultEvent(raw)];
      if (raw.type === 'assistant') return toolUses(raw.message?.content);
      if (raw.type !== 'stream_event') return [];
      const event = raw.event;
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        return typeof event.delta.text === 'string' ? text(event.delta.text) : [];
      }
      if (event?.type === 'content_block_stop' || event?.type === 'message_stop') return flush();
      return [];
    },
    end: flush,
  };
}

/** 한 줄만 보는 경우(상태 없음). 그 줄 안에서 끝난 `PRD_DRAFT:` 줄도 잡는다. 스트림에는 `createStreamParser` 를 쓴다. */
export function parseStreamLine(line: string): ChatEvent[] {
  const parser = createStreamParser();
  return [...parser.push(line), ...parser.end()];
}
