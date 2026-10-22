// 이 기능이 스스로 고르는 문구. 서버가 준 문구(409 의 전제 어긋남 등)는 그대로 쓰고 여기 두지 않는다.
// features/start-implementation 의 선례대로 model 한 곳에 모은다.
export const PUBLISH_PRD_TEXT = {
  failed: '이슈로 올리지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  interrupted: '진행 소식이 끊겼어요. 이 Mac 의 터미널에서 상태를 확인해 주세요.',
  forbidden: '관리자만 이슈로 올릴 수 있어요.',
} as const;
