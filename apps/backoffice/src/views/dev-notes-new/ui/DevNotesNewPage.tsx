'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchDraft } from '@/entities/prd-draft';
import { usePrdChat } from '@/features/prd-chat';
import { usePublishPrd } from '@/features/publish-prd';
import { PageTitle } from '@/shared/ui';
import { useAuthErrorRedirect } from '@/widgets/app-shell';
import { dateTimeText, IssueMarkdown } from '@/widgets/issue-detail';
import { PrdComposer } from '@/widgets/prd-composer';
import {
  NO_PREVIEW,
  previewFailed,
  previewKind,
  previewStarted,
  previewSucceeded,
} from '../model/preview';

const DEV_NOTES_NEW_TEXT = {
  title: 'PRD 쓰기',
  description:
    '이 Mac 의 Claude Code 와 대화해 PRD 초안을 써요. 초안이 마음에 들면 이슈로 올려 Todo 에 넣어요.',
} as const;

const DEV_NOTES_PATH = '/dev-notes';

function Composer({ onReset }: { onReset: () => void }) {
  const handleAuthError = useAuthErrorRedirect();
  const chat = usePrdChat();
  const publish = usePublishPrd();
  const [preview, setPreview] = useState(NO_PREVIEW);
  const { draftFile, draftVersion } = chat;

  const loadDraft = useCallback(
    async (file: string, signal?: AbortSignal) => {
      setPreview((state) => previewStarted(state, file));
      try {
        const draft = await fetchDraft(file, signal);
        setPreview((state) => previewSucceeded(state, file, draft));
      } catch (error: unknown) {
        if (signal?.aborted) return;
        if (!handleAuthError(error)) setPreview((state) => previewFailed(state, file, error));
      }
    },
    [handleAuthError],
  );

  // 초안 줄이 올 때마다(같은 파일이 다시 적혀도 draftVersion 이 는다) 다시 읽는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftVersion 은 다시 읽는 신호로만 쓴다
  useEffect(() => {
    if (!draftFile) {
      setPreview(NO_PREVIEW);
      return;
    }
    const controller = new AbortController();
    void loadDraft(draftFile, controller.signal);
    return () => controller.abort();
  }, [draftFile, draftVersion, loadDraft]);

  const kind = previewKind(preview);
  const file = preview.draft?.file ?? preview.file;

  return (
    <PrdComposer
      chat={{
        messages: chat.messages,
        status: chat.status,
        error: chat.error,
        onSend: chat.send,
        onReset: () => {
          chat.reset();
          onReset();
        },
      }}
      preview={{
        kind,
        file,
        updatedText: preview.draft ? dateTimeText(preview.draft.updatedAt) : null,
        failed: preview.failed,
        preview: preview.draft ? <IssueMarkdown text={preview.draft.body} /> : null,
        onRetry: () => draftFile && void loadDraft(draftFile),
        publish,
        publishDisabled: chat.status === 'streaming' || kind !== 'ready',
        onPublish: () => file && void publish.publish(file),
        backHref: DEV_NOTES_PATH,
      }}
    />
  );
}

export function DevNotesNewPage() {
  // "새 대화" 는 채팅과 올리기 상태를 모두 새로 만든다.
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <PageTitle title={DEV_NOTES_NEW_TEXT.title} description={DEV_NOTES_NEW_TEXT.description} />
      <Composer key={generation} onReset={() => setGeneration((value) => value + 1)} />
    </>
  );
}
