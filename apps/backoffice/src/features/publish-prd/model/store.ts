// "이슈로 올리기" 스토어. 돌고 있거나 끝났으면 다시 받지 않고, 실패하거나 시작 못 했으면 다시 누를 수 있다.
// 이미 끝난 단계는 서버가 되돌리지 않는다.
import { createStore } from 'zustand/vanilla';
import { type PublishEvent, publishDraft } from '@/entities/prd-draft';
import { isApiError } from '@/shared/api';
import {
  applyPublishEvent,
  beginPublish,
  endPublish,
  INITIAL_PUBLISH_PRD,
  type PublishPrdData,
  rejectPublish,
} from './reduce';
import { PUBLISH_PRD_TEXT } from './texts';

export type PublishPrdState = PublishPrdData & {
  /** 초안 파일(basename)을 이슈로 올린다. 돌고 있거나 done 이면 무시한다. */
  publish: (file: string) => Promise<void>;
};

function rejectionText(error: unknown): string {
  if (!isApiError(error)) return PUBLISH_PRD_TEXT.failed;
  if (error.status === 403) return PUBLISH_PRD_TEXT.forbidden;
  // 400·404·409 의 서버 문구는 화면에 그대로 보여도 되는 한국어 글이다(app/api/prd-chat).
  if (error.status === 400 || error.status === 404 || error.status === 409) return error.message;
  return PUBLISH_PRD_TEXT.failed;
}

export function createPublishPrdStore() {
  return createStore<PublishPrdState>()((set, get) => {
    const update = (next: (data: PublishPrdData) => PublishPrdData) => set((state) => next(state));

    return {
      ...INITIAL_PUBLISH_PRD,
      publish: async (file) => {
        const { status } = get();
        if (status === 'running' || status === 'done') return;
        update(beginPublish);

        let events: AsyncIterable<PublishEvent>;
        try {
          events = await publishDraft(file);
        } catch (error: unknown) {
          update((data) => rejectPublish(data, rejectionText(error)));
          return;
        }

        try {
          for await (const event of events) update((data) => applyPublishEvent(data, event));
        } catch {
          // 끊긴 것은 아래 endPublish 가 running 을 보고 알린다.
        }
        update(endPublish);
      },
    };
  });
}

export type PublishPrdStore = ReturnType<typeof createPublishPrdStore>;
