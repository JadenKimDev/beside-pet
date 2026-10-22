// 오른쪽 미리보기가 읽는 초안 하나. 같은 파일을 다시 읽는 동안에는 보이던 본문을 두고, 다른 파일이면 비운다.
// 늦게 온 다른 파일의 응답은 버린다. 404 는 "아직 초안이 없어요"(스킬이 줄을 적었지만 파일이 아직 없거나 옮겨졌다).
// 401·403 은 views 가 먼저 가로챈다(useAuthErrorRedirect).
import type { PrdDraft } from '@/entities/prd-draft';
import { isApiError } from '@/shared/api';

export type DraftPreview = {
  file: string | null;
  draft: PrdDraft | null;
  loading: boolean;
  failed: boolean;
};

export type DraftPreviewKind = 'empty' | 'loading' | 'ready' | 'failed';

export const NO_PREVIEW: DraftPreview = { file: null, draft: null, loading: false, failed: false };

export function previewKind(state: DraftPreview): DraftPreviewKind {
  if (state.draft) return 'ready';
  if (state.loading) return 'loading';
  if (state.failed) return 'failed';
  return 'empty';
}

export function previewStarted(state: DraftPreview, file: string): DraftPreview {
  if (state.file === file) return { ...state, loading: true, failed: false };
  return { file, draft: null, loading: true, failed: false };
}

export function previewSucceeded(state: DraftPreview, file: string, draft: PrdDraft): DraftPreview {
  if (state.file !== file) return state;
  return { file, draft, loading: false, failed: false };
}

export function previewFailed(state: DraftPreview, file: string, error: unknown): DraftPreview {
  if (state.file !== file) return state;
  if (isApiError(error) && error.status === 404) {
    return { file, draft: null, loading: false, failed: false };
  }
  return { ...state, loading: false, failed: true };
}
