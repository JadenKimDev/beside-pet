import { describe, expect, it } from 'vitest';
import { type ChatEvent, createStreamParser, parseStreamLine } from './index';

// `claude -p --output-format stream-json --include-partial-messages --verbose` 의 줄 모양.
// 2026-10-22 이 머신에서 한 번 실측한 줄에서 세션 id 와 uuid 를 지어낸 값으로 바꾸고 칸을 줄였다.
const SID = '00000000-0000-4000-8000-000000000001';
const line = (value: object) => JSON.stringify(value);
const streamEvent = (event: object, parent: string | null = null) =>
  line({ type: 'stream_event', event, session_id: SID, parent_tool_use_id: parent, uuid: 'u-1' });
const textDelta = (text: string) =>
  streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
const blockStop = streamEvent({ type: 'content_block_stop', index: 0 });

const INIT = line({
  type: 'system',
  subtype: 'init',
  cwd: '/tmp/fake',
  session_id: SID,
  tools: ['Read'],
});
const HOOK = line({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup' });
const MESSAGE_START = streamEvent({
  type: 'message_start',
  message: { model: 'fake-model', id: 'msg_fake', role: 'assistant', content: [] },
});
const TEXT_START = streamEvent({
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
});
const RATE = line({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } });
const RESULT_OK = line({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '안녕',
  session_id: SID,
  duration_api_ms: 1367,
});
const RESULT_ERROR = line({
  type: 'result',
  subtype: 'error_during_execution',
  is_error: true,
  result: 'Invalid API key',
  session_id: SID,
});

describe('parseStreamLine', () => {
  it('turns a text_delta into a text event', () => {
    expect(parseStreamLine(textDelta('안녕'))).toEqual([{ type: 'text_delta', text: '안녕' }]);
  });

  it('ignores system, message_start, text block start, stop and rate limit lines', () => {
    for (const l of [INIT, HOOK, MESSAGE_START, TEXT_START, blockStop, RATE]) {
      expect(parseStreamLine(l)).toEqual([]);
    }
  });

  it('ignores lines that are not JSON or not objects', () => {
    expect(parseStreamLine('')).toEqual([]);
    expect(parseStreamLine('not json')).toEqual([]);
    expect(parseStreamLine('[1,2]')).toEqual([]);
    expect(parseStreamLine('null')).toEqual([]);
    expect(parseStreamLine('{"type":"something_new"}')).toEqual([]);
  });

  it('turns a successful result into ok', () => {
    expect(parseStreamLine(RESULT_OK)).toEqual([{ type: 'result', ok: true }]);
  });

  it('turns an error result into not ok with the reason', () => {
    expect(parseStreamLine(RESULT_ERROR)).toEqual([
      { type: 'result', ok: false, error: 'Invalid API key' },
    ]);
    const noText = line({ type: 'result', subtype: 'error_max_turns', is_error: true });
    expect(parseStreamLine(noText)).toEqual([
      { type: 'result', ok: false, error: 'error_max_turns' },
    ]);
  });

  it('reports a tool use from the assistant message with its name and file path only', () => {
    const assistant = line({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '초안을 씁니다' },
          {
            type: 'tool_use',
            id: 'toolu_fake',
            name: 'Write',
            input: { file_path: '/repo/docs/prd/fake-draft.md', content: '# 지어낸 본문' },
          },
          { type: 'tool_use', id: 'toolu_fake2', name: 'Bash', input: { command: 'ls docs/prd' } },
          {
            type: 'tool_use',
            id: 'toolu_fake3',
            name: 'Grep',
            input: { pattern: 'x', path: 'apps' },
          },
        ],
      },
      session_id: SID,
      parent_tool_use_id: null,
    });
    expect(parseStreamLine(assistant)).toEqual([
      { type: 'tool_use', name: 'Write', path: '/repo/docs/prd/fake-draft.md' },
      { type: 'tool_use', name: 'Bash' },
      { type: 'tool_use', name: 'Grep', path: 'apps' },
    ]);
  });

  it('does not report the empty tool_use block start (its input streams later)', () => {
    const start = streamEvent({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_fake', name: 'Write', input: {} },
    });
    expect(parseStreamLine(start)).toEqual([]);
  });

  it('ignores events from a sub agent', () => {
    expect(
      parseStreamLine(
        streamEvent(
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } },
          'toolu_parent',
        ),
      ),
    ).toEqual([]);
  });

  it('finds a draft line inside a single delta', () => {
    expect(parseStreamLine(textDelta('다 썼어요.\nPRD_DRAFT: docs/prd/fake-draft.md'))).toEqual([
      { type: 'text_delta', text: '다 썼어요.\nPRD_DRAFT: docs/prd/fake-draft.md' },
      { type: 'draft', file: 'fake-draft.md' },
    ]);
  });
});

describe('createStreamParser', () => {
  const drafts = (events: ChatEvent[]) => events.filter((e) => e.type === 'draft');

  it('finds a draft line split across deltas', () => {
    const parser = createStreamParser();
    const events = [
      textDelta('초안을 고쳤어요.\nPRD_'),
      textDelta('DRAFT: docs/p'),
      textDelta('rd/queued-column.md\n'),
      textDelta('더 고칠 게 있으면 말해 주세요.'),
      blockStop,
    ].flatMap((l) => parser.push(l));
    expect(drafts(events)).toEqual([{ type: 'draft', file: 'queued-column.md' }]);
  });

  it('flushes the last line at block stop and at result', () => {
    const atStop = createStreamParser();
    expect(
      drafts([textDelta('PRD_DRAFT: docs/prd/a.md'), blockStop].flatMap((l) => atStop.push(l))),
    ).toEqual([{ type: 'draft', file: 'a.md' }]);
    const atResult = createStreamParser();
    const events = [textDelta('PRD_DRAFT: docs/prd/b.md'), RESULT_OK].flatMap((l) =>
      atResult.push(l),
    );
    expect(events.slice(-2)).toEqual([
      { type: 'draft', file: 'b.md' },
      { type: 'result', ok: true },
    ]);
  });

  it('does not join a line across two text blocks', () => {
    const parser = createStreamParser();
    const events = [
      textDelta('PRD_DRAFT: docs/prd/a'),
      blockStop,
      textDelta('.md'),
      blockStop,
    ].flatMap((l) => parser.push(l));
    expect(drafts(events)).toEqual([]);
  });

  it('emits the draft every time it is written', () => {
    const parser = createStreamParser();
    const events = [
      textDelta('PRD_DRAFT: docs/prd/a.md\n'),
      textDelta('고쳤어요\nPRD_DRAFT: docs/prd/a.md\n'),
    ].flatMap((l) => parser.push(l));
    expect(drafts(events)).toHaveLength(2);
  });

  it('accepts backticks around the path', () => {
    const parser = createStreamParser();
    expect(drafts(parser.push(textDelta('PRD_DRAFT: `docs/prd/a-b_c.1.md`\n')))).toEqual([
      { type: 'draft', file: 'a-b_c.1.md' },
    ]);
  });

  it('rejects draft paths outside docs/prd or with bad names', () => {
    for (const bad of [
      'PRD_DRAFT: docs/prd/../secret.md',
      'PRD_DRAFT: docs/prd/a/b.md',
      'PRD_DRAFT: /etc/passwd',
      'PRD_DRAFT: docs/prd/a.txt',
      'PRD_DRAFT: docs/prd/a b.md',
      'PRD_DRAFT: docs/adr/a.md',
      '말 중간의 PRD_DRAFT: docs/prd/a.md',
    ]) {
      const parser = createStreamParser();
      expect(drafts(parser.push(textDelta(`${bad}\n`))), bad).toEqual([]);
    }
  });
});
