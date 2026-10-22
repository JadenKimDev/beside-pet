// 확인 모달과 만료 모달의 문구(화면 안 8절).
import type { ModerationAction } from './actions';

export type ConfirmAction = Extract<ModerationAction, 'revoke' | 'softDelete' | 'purge'>;

export const CONFIRM_TEXT: Record<
  ConfirmAction,
  { title: (username: string) => string; body: string; confirm: string }
> = {
  revoke: {
    title: (username) => `${username} 계정을 정지할까요?`,
    body: '정지하면 이 계정의 다음 요청부터 대화 웹이 로그인 화면으로 돌아가요. 언제든 재개할 수 있어요.',
    confirm: '정지',
  },
  softDelete: {
    title: (username) => `${username} 계정을 삭제할까요?`,
    body: '삭제한 계정은 로그인할 수 없어요. 나중에 복구할 수 있어요.',
    confirm: '삭제',
  },
  purge: {
    title: (username) => `${username} 계정을 완전히 지울까요?`,
    body: '계정이 지워지고 되돌릴 수 없어요. 같은 아이디로 다시 발급할 수 있어요.',
    confirm: '완전 삭제',
  },
};

export const DIALOG_TEXT = {
  cancel: '취소',
  save: '저장',
  noAction: '—',
  typeUsername: (username: string) => `확인하려면 ${username} 를 그대로 입력해 주세요.`,
  expiryTitle: (username: string) => `${username} 계정의 만료`,
  expiryInput: '만료 시각',
  clearExpiry: '만료 해제',
  quick: (days: number) => (days === 365 ? '+1년' : `+${days}일`),
} as const;

/** 완전 삭제의 보존 기간 안내. */
export const PURGE_TEXT = {
  daysLeft: (days: number) => `삭제 3개월 뒤에 완전 삭제할 수 있어요. ${days}일 남았어요.`,
  noSuspendedAt: '삭제 시각이 없어 완전 삭제할 수 없어요.',
  suspendedAt: (time: string) => `삭제 ${time}`,
} as const;
