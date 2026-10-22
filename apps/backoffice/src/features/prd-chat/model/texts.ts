// 이 기능이 스스로 고르는 문구. 서버가 준 문구(409, 503 등)는 그대로 쓰고 여기 두지 않는다.
// 글자 리터럴은 views·widgets 에 두는 것이 규칙이지만, 상태가 문구를 고르는 기능은 features/start-implementation 의 선례대로 model 한 곳에 모은다.
export const PRD_CHAT_TEXT = {
  noAnswer: '답을 받지 못했어요. 잠시 뒤 다시 보내 주세요.',
  forbidden: '관리자만 PRD 를 쓸 수 있어요.',
} as const;
