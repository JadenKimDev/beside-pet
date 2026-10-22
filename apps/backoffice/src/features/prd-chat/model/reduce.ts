// PRD 채팅의 상태 전환. 스토어는 이 순수 함수들만 부른다.
import type { ChatEvent } from '@/entities/prd-draft';
import { PRD_CHAT_TEXT } from './texts';

export type PrdChatStatus = 'idle' | 'streaming' | 'error';

export type PrdChatTool = { name: string; path?: string };

export type PrdChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  /** assistant 메시지가 쓴 도구(이름과 파일 경로만). 없으면 칸이 없다. */
  tools?: PrdChatTool[];
};

export type PrdChatData = {
  messages: PrdChatMessage[];
  sessionId: string | null;
  /** 미리보기에 보일 초안 파일 이름(basename). */
  draftFile: string | null;
  /** `draft` 이벤트마다 1 씩 는다. 같은 파일이 다시 적혀도 늘므로 화면은 이 값이 바뀌면 초안을 다시 읽는다. */
  draftVersion: number;
  status: PrdChatStatus;
  /** 채팅 칸 위에 보일 글. */
  error: string | null;
};

export const INITIAL_PRD_CHAT: PrdChatData = {
  messages: [],
  sessionId: null,
  draftFile: null,
  draftVersion: 0,
  status: 'idle',
  error: null,
};

/** 사용자 메시지를 붙이고 답을 기다린다. */
export function beginSend(data: PrdChatData, text: string): PrdChatData {
  return {
    ...data,
    messages: [...data.messages, { role: 'user', text }],
    status: 'streaming',
    error: null,
  };
}

/** 지금 답하고 있는 assistant 메시지를 바꾼다. 마지막이 assistant 가 아니면 새로 만든다. */
function updateAssistant(
  data: PrdChatData,
  update: (message: PrdChatMessage) => PrdChatMessage,
): PrdChatData {
  const last = data.messages.at(-1);
  if (last?.role === 'assistant') {
    return { ...data, messages: [...data.messages.slice(0, -1), update(last)] };
  }
  return { ...data, messages: [...data.messages, update({ role: 'assistant', text: '' })] };
}

export function applyChatEvent(data: PrdChatData, event: ChatEvent): PrdChatData {
  switch (event.type) {
    case 'session':
      return { ...data, sessionId: event.id };
    case 'text_delta':
      return updateAssistant(data, (message) => ({ ...message, text: message.text + event.text }));
    case 'tool_use': {
      const tool: PrdChatTool =
        event.path === undefined ? { name: event.name } : { name: event.name, path: event.path };
      return updateAssistant(data, (message) => ({
        ...message,
        tools: [...(message.tools ?? []), tool],
      }));
    }
    case 'draft':
      return { ...data, draftFile: event.file, draftVersion: data.draftVersion + 1 };
    case 'result':
      return event.ok
        ? { ...data, status: 'idle', error: null }
        : failStream(data, event.error || PRD_CHAT_TEXT.noAnswer);
    case 'error':
      return failStream(data, event.message);
  }
}

/** 스트림이 끝났다. `result` 없이 끝났으면 오류로 둔다. */
export function endStream(data: PrdChatData): PrdChatData {
  return data.status === 'streaming' ? failStream(data, PRD_CHAT_TEXT.noAnswer) : data;
}

/** 답이 흐르다 막혔다. 여기까지의 메시지는 남긴다. */
export function failStream(data: PrdChatData, error: string): PrdChatData {
  return { ...data, status: 'error', error };
}

/**
 * 보내기가 시작 전에 거절됐다(409, 503 등). `beginSend` 가 붙인 사용자 메시지를 되돌린다:
 * 서버가 받지 않은 글이 대화에 남지 않게 하고, 화면은 입력 칸의 글을 지우지 않고 다시 보내게 한다.
 */
export function rejectSend(data: PrdChatData, error: string): PrdChatData {
  const last = data.messages.at(-1);
  const messages = last?.role === 'user' ? data.messages.slice(0, -1) : data.messages;
  return { ...data, messages, status: 'error', error };
}
