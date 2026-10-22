import { describe, expect, it } from 'vitest';
import {
  applyChatEvent,
  beginSend,
  endStream,
  failStream,
  INITIAL_PRD_CHAT,
  type PrdChatData,
  rejectSend,
} from './reduce';
import { PRD_CHAT_TEXT } from './texts';

const SESSION_ID = '0b9f2c1e-1111-4222-8333-444455556666';

function streaming(): PrdChatData {
  return beginSend(INITIAL_PRD_CHAT, '지어낸 첫 메시지');
}

describe('prd-chat reduce', () => {
  it('beginSend appends the user message and starts streaming', () => {
    const data = beginSend({ ...INITIAL_PRD_CHAT, status: 'error', error: '앞의 오류' }, '안녕');
    expect(data).toMatchObject({
      status: 'streaming',
      error: null,
      messages: [{ role: 'user', text: '안녕' }],
    });
  });

  it('session stores the id', () => {
    expect(applyChatEvent(streaming(), { type: 'session', id: SESSION_ID }).sessionId).toBe(
      SESSION_ID,
    );
  });

  it('text_delta starts one assistant message and keeps appending to it', () => {
    let data = applyChatEvent(streaming(), { type: 'text_delta', text: '무엇을 ' });
    data = applyChatEvent(data, { type: 'text_delta', text: '만들까요?' });
    expect(data.messages).toEqual([
      { role: 'user', text: '지어낸 첫 메시지' },
      { role: 'assistant', text: '무엇을 만들까요?' },
    ]);
  });

  it('a new turn starts a new assistant message after the user message', () => {
    let data = applyChatEvent(streaming(), { type: 'text_delta', text: '첫 답' });
    data = applyChatEvent(data, { type: 'result', ok: true });
    data = beginSend(data, '둘째 질문');
    data = applyChatEvent(data, { type: 'text_delta', text: '둘째 답' });
    expect(data.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', '지어낸 첫 메시지'],
      ['assistant', '첫 답'],
      ['user', '둘째 질문'],
      ['assistant', '둘째 답'],
    ]);
  });

  it('tool_use adds to the tools of the current assistant message', () => {
    let data = applyChatEvent(streaming(), { type: 'tool_use', name: 'Read' });
    data = applyChatEvent(data, { type: 'text_delta', text: '초안을 썼어요' });
    data = applyChatEvent(data, { type: 'tool_use', name: 'Write', path: 'docs/prd/x.md' });
    expect(data.messages[1]).toEqual({
      role: 'assistant',
      text: '초안을 썼어요',
      tools: [{ name: 'Read' }, { name: 'Write', path: 'docs/prd/x.md' }],
    });
  });

  it('draft sets the file and bumps the version even for the same file', () => {
    let data = applyChatEvent(streaming(), { type: 'draft', file: 'x.md' });
    expect(data).toMatchObject({ draftFile: 'x.md', draftVersion: 1 });
    data = applyChatEvent(data, { type: 'draft', file: 'x.md' });
    expect(data).toMatchObject({ draftFile: 'x.md', draftVersion: 2 });
  });

  it('result ok goes idle', () => {
    expect(applyChatEvent(streaming(), { type: 'result', ok: true })).toMatchObject({
      status: 'idle',
      error: null,
    });
  });

  it('result not ok goes error with its text, or the default text', () => {
    expect(
      applyChatEvent(streaming(), { type: 'result', ok: false, error: '지어낸 실패' }),
    ).toMatchObject({ status: 'error', error: '지어낸 실패' });
    expect(applyChatEvent(streaming(), { type: 'result', ok: false })).toMatchObject({
      status: 'error',
      error: PRD_CHAT_TEXT.noAnswer,
    });
  });

  it('error goes error with the server message and keeps the messages', () => {
    let data = applyChatEvent(streaming(), { type: 'text_delta', text: '반쯤' });
    data = applyChatEvent(data, { type: 'error', message: 'claude 가 1 로 끝났어요' });
    expect(data).toMatchObject({ status: 'error', error: 'claude 가 1 로 끝났어요' });
    expect(data.messages).toHaveLength(2);
  });

  it('endStream turns a stream that ended without result into an error', () => {
    expect(endStream(streaming())).toMatchObject({
      status: 'error',
      error: PRD_CHAT_TEXT.noAnswer,
    });
    const done = applyChatEvent(streaming(), { type: 'result', ok: true });
    expect(endStream(done)).toBe(done);
  });

  it('failStream keeps the messages', () => {
    const data = failStream(applyChatEvent(streaming(), { type: 'text_delta', text: '반' }), 'x');
    expect(data).toMatchObject({ status: 'error', error: 'x' });
    expect(data.messages).toHaveLength(2);
  });

  it('rejectSend (409, 503 before any answer) removes the user message it added', () => {
    let data = applyChatEvent(streaming(), { type: 'result', ok: true });
    data = beginSend(data, '거절될 메시지');
    data = rejectSend(data, '답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.');
    expect(data.messages.map((m) => m.text)).toEqual(['지어낸 첫 메시지']);
    expect(data).toMatchObject({
      status: 'error',
      error: '답이 아직 흐르고 있어요. 끝난 뒤 보내 주세요.',
    });
  });
});
