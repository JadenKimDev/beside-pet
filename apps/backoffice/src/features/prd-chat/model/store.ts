// PRD 채팅 스토어. 첫 보내기는 세션을 열고, 그 뒤는 같은 세션을 잇는다. 세션 id 와 초안 파일 이름은
// sessionStorage 에 두어 새로고침해도 이어진다(메시지 목록은 남기지 않는다. 대화는 claude 의 세션이 기억한다).
import { createStore } from 'zustand/vanilla';
import { type ChatEvent, openChatSession, sendChatMessage } from '@/entities/prd-draft';
import { isApiError } from '@/shared/api';
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

export const PRD_CHAT_STORAGE_KEYS = {
  sessionId: 'backoffice.prd-chat.session-id',
  draftFile: 'backoffice.prd-chat.draft-file',
} as const;

/** `sessionStorage` 와 같은 모양. 테스트는 Map 으로 만든 것을 준다. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PrdChatStoreOptions = {
  /** 생략하면 브라우저의 sessionStorage, `window` 가 없으면 보관하지 않는다. `null` 이면 보관하지 않는다. */
  storage?: KeyValueStorage | null;
};

export type PrdChatState = PrdChatData & {
  /**
   * 메시지를 보낸다. 답이 흐르는 중이거나 빈 글이면 무시하고 false. 시작 전에 거절되면(409, 503 등) 사용자 메시지를
   * 되돌리고 false(화면은 입력 칸의 글을 남긴다). 서버가 받아 답이 흐르기 시작했으면 끝난 뒤 true.
   */
  send: (message: string) => Promise<boolean>;
  /** sessionStorage 의 세션 id 와 초안 파일 이름을 읽어 온다. 마운트 뒤 한 번 부른다(서버 렌더와 어긋나지 않게). */
  restore: () => void;
  /** 흐르는 답을 끊고 새 대화로 비운다. 보관한 값도 지운다. */
  reset: () => void;
};

function defaultStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function rejectionText(error: unknown): string {
  if (!isApiError(error)) return PRD_CHAT_TEXT.noAnswer;
  if (error.status === 403) return PRD_CHAT_TEXT.forbidden;
  // 400·409·503 의 서버 문구는 화면에 그대로 보여도 되는 한국어 글이다(app/api/prd-chat).
  if (error.status === 400 || error.status === 409 || error.status === 503) return error.message;
  return PRD_CHAT_TEXT.noAnswer;
}

function save(storage: KeyValueStorage | null, key: string, value: string | null) {
  if (!storage) return;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // 보관하지 못해도 대화는 이어진다.
  }
}

export function createPrdChatStore(options: PrdChatStoreOptions = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  let controller: AbortController | null = null;

  const store = createStore<PrdChatState>()((set, get) => {
    const update = (next: (data: PrdChatData) => PrdChatData) => set((state) => next(state));

    return {
      ...INITIAL_PRD_CHAT,
      send: async (message) => {
        const text = message.trim();
        if (!text || get().status === 'streaming') return false;
        update((data) => beginSend(data, text));
        const own = new AbortController();
        controller = own;
        const { sessionId } = get();

        let events: AsyncIterable<ChatEvent>;
        try {
          events = sessionId
            ? await sendChatMessage(sessionId, text, own.signal)
            : await openChatSession(text, own.signal);
        } catch (error: unknown) {
          if (controller === own) update((data) => rejectSend(data, rejectionText(error)));
          return false;
        }

        try {
          for await (const event of events) {
            if (controller !== own) return true;
            update((data) => applyChatEvent(data, event));
          }
          if (controller === own) update(endStream);
        } catch {
          if (controller === own) update((data) => failStream(data, PRD_CHAT_TEXT.noAnswer));
        }
        return true;
      },
      restore: () => {
        if (!storage) return;
        try {
          set({
            sessionId: storage.getItem(PRD_CHAT_STORAGE_KEYS.sessionId),
            draftFile: storage.getItem(PRD_CHAT_STORAGE_KEYS.draftFile),
          });
        } catch {
          // 읽지 못하면 새 대화로 시작한다.
        }
      },
      reset: () => {
        controller?.abort();
        controller = null;
        set({ ...INITIAL_PRD_CHAT });
      },
    };
  });

  store.subscribe((state, previous) => {
    if (state.sessionId !== previous.sessionId) {
      save(storage, PRD_CHAT_STORAGE_KEYS.sessionId, state.sessionId);
    }
    if (state.draftFile !== previous.draftFile) {
      save(storage, PRD_CHAT_STORAGE_KEYS.draftFile, state.draftFile);
    }
  });

  return store;
}

export type PrdChatStore = ReturnType<typeof createPrdChatStore>;
