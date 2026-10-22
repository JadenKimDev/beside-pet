// "이슈로 올리기" 의 상태 전환. 스토어는 이 순수 함수들만 부른다.
import {
  PUBLISH_STEPS,
  type PublishEvent,
  type PublishStatus,
  type PublishStep,
} from '@/entities/prd-draft';
import { PUBLISH_PRD_TEXT } from './texts';

/** idle → running → done | failed(한 단계가 실패) | error(시작 못 함, 또는 소식이 끊김). */
export type PublishPrdStatus = 'idle' | 'running' | 'done' | 'failed' | 'error';

export type PublishStepLog = {
  step: PublishStep;
  /** 아직 돌지 않은 단계는 pending. */
  status: 'pending' | PublishStatus;
  /** 그 단계의 stdout+stderr. */
  output: string;
};

export type PublishPrdData = {
  status: PublishPrdStatus;
  /** 다섯 단계, 도는 차례대로. */
  steps: PublishStepLog[];
  /** push 가 끝나면 생긴다. 뒤 단계가 실패해도 남는다(이슈는 이미 있다). */
  issue: number | null;
  url: string | null;
  /** 시작하지 못한 이유(409 의 서버 문구 등)나 끊긴 이유. */
  error: string | null;
};

const LAST_STEP = PUBLISH_STEPS[PUBLISH_STEPS.length - 1];

function pendingSteps(): PublishStepLog[] {
  return PUBLISH_STEPS.map((step) => ({ step, status: 'pending', output: '' }));
}

export const INITIAL_PUBLISH_PRD: PublishPrdData = {
  status: 'idle',
  steps: pendingSteps(),
  issue: null,
  url: null,
  error: null,
};

export function beginPublish(_data: PublishPrdData): PublishPrdData {
  return { ...INITIAL_PUBLISH_PRD, steps: pendingSteps(), status: 'running' };
}

export function applyPublishEvent(data: PublishPrdData, event: PublishEvent): PublishPrdData {
  const steps = data.steps.map((log) =>
    log.step === event.step ? { step: log.step, status: event.status, output: event.output } : log,
  );
  const next: PublishPrdData = { ...data, steps };
  if (event.step === 'push' && event.status === 'ok') {
    if (event.issue !== undefined) next.issue = event.issue;
    if (event.url !== undefined) next.url = event.url;
  }
  if (event.status === 'failed') next.status = 'failed';
  else if (event.status === 'ok' && event.step === LAST_STEP) next.status = 'done';
  return next;
}

/** 스트림이 끝났다. 아직 running 이면 소식이 끊긴 것이다. */
export function endPublish(data: PublishPrdData): PublishPrdData {
  return data.status === 'running'
    ? { ...data, status: 'error', error: PUBLISH_PRD_TEXT.interrupted }
    : data;
}

/** 시작 전에 거절됐다(409 등). */
export function rejectPublish(data: PublishPrdData, error: string): PublishPrdData {
  return { ...data, status: 'error', error };
}
