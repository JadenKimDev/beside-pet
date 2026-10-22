import { ChatPanel, type ChatPanelProps } from './ChatPanel';
import { PreviewPanel, type PreviewPanelProps } from './PreviewPanel';

export type PrdComposerProps = {
  chat: ChatPanelProps;
  preview: PreviewPanelProps;
};

/** PRD 쓰기: 왼쪽 채팅, 오른쪽 초안 미리보기와 "이슈로 올리기". md 미만에서는 위아래로 쌓인다. 상태는 views 가 묶어 준다. */
export function PrdComposer({ chat, preview }: PrdComposerProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <ChatPanel {...chat} />
      <PreviewPanel {...preview} />
    </div>
  );
}
