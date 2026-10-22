'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createPrdChatStore, type PrdChatState, type PrdChatStore } from './store';

/**
 * PRD 쓰기 화면 하나의 채팅. 스토어를 주지 않으면 화면마다 하나 만들고, 마운트 뒤 sessionStorage 에서
 * 세션 id 와 초안 파일 이름을 되살린다. 상태와 `send`·`reset` 을 돌려준다.
 */
export function usePrdChat(store?: PrdChatStore): PrdChatState {
  const [own] = useState(() => store ?? createPrdChatStore());
  useEffect(() => {
    own.getState().restore();
  }, [own]);
  return useStore(own);
}
