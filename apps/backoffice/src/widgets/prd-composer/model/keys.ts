// 채팅 입력 칸의 키 처리. Enter 는 보내고 Shift+Enter 는 줄을 바꾼다. 한글 조합 중의 Enter 는 조합을 끝내는 것이라 보내지 않는다.

export type SendKeyEvent = {
  key: string;
  shiftKey: boolean;
  /** 네이티브 KeyboardEvent.isComposing. */
  isComposing: boolean;
  /** Safari 는 조합을 끝내는 Enter 에서 isComposing 이 false 이고 keyCode 가 229 다. */
  keyCode: number;
};

const IME_PROCESS_KEY = 229;

export function isSendKey(event: SendKeyEvent): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  return !event.isComposing && event.keyCode !== IME_PROCESS_KEY;
}
