'use client';

import { useState } from 'react';
import { useStore } from 'zustand';
import { createPublishPrdStore, type PublishPrdState, type PublishPrdStore } from './store';

/** "이슈로 올리기" 하나. 스토어를 주지 않으면 화면마다 하나 만든다. 상태와 `publish(file)` 을 돌려준다. */
export function usePublishPrd(store?: PublishPrdStore): PublishPrdState {
  const [own] = useState(() => store ?? createPublishPrdStore());
  return useStore(own);
}
