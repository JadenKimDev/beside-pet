/**
 * features/report/report.store.ts — 마음 리포트 한 장의 불러오기.
 *
 * 서버의 409(아직 안 열림)를 상태 코드로 가르지 않는다. 전송 층(lib/http)이 오류에 상태 코드를
 * 싣지 않으므로, 먼저 대화의 `reportAvailable`(서버의 409 조건과 같다)로 가르고, 열린 리포트를
 * 불러오다 실패하면 다시 시도로 둔다.
 *
 * 화면은 한 번에 리포트 하나만 그리므로 칸은 하나다. 늦게 온 이전 대화의 응답이 지금 칸을
 * 덮지 않도록 요청마다 표를 단다.
 */
import { create } from 'zustand';
import type { MindReport } from '@/lib/api';
import * as data from '@/lib/data';
import type { ReportPhase } from './report.types';

interface ReportState {
  sessionId?: string;
  phase: ReportPhase;
  report?: MindReport;
  /** 리포트를 지우는 중. */
  deleting: boolean;
  /** 리포트를 불러온다. 다시 시도도 같은 동작이다. */
  load: (sessionId: string) => Promise<void>;
  /** 리포트를 지운다(대화는 남는다, ADR-0036). 실패는 던지고, 칸은 그대로 둔다. 이동은 화면이 한다. */
  remove: (sessionId: string) => Promise<void>;
}

let loadToken = 0;

export const useReportStore = create<ReportState>((set) => ({
  sessionId: undefined,
  phase: 'idle',
  report: undefined,
  deleting: false,

  async load(sessionId) {
    const token = ++loadToken;
    set({ sessionId, phase: 'loading', report: undefined });
    try {
      const state = await data.getSessionState(sessionId);
      if (token !== loadToken) return;
      if (!state.reportAvailable) {
        set({ phase: 'notReady' });
        return;
      }
      const report = await data.getReport(sessionId);
      if (token !== loadToken) return;
      // 짧은 대화는 서버가 모델을 부르지 않고 빈 절 배열을 준다(#32). 리포트를 쓰지 않았다는 사실이다.
      set({ phase: report.sections.length === 0 ? 'empty' : 'ready', report });
    } catch {
      if (token !== loadToken) return;
      set({ phase: 'failed' });
    }
  },

  async remove(sessionId) {
    set({ deleting: true });
    try {
      await data.deleteReport(sessionId);
      // 화면은 곧 목록으로 가므로 칸은 비우지 않는다(비우면 가는 동안 "쓰는 중"이 깜박인다).
      // 다시 열면 load 가 칸을 새로 채우고, 서버는 지운 리포트를 404 로 준다.
      // 늦게 온 불러오기가 이 뒤에 칸을 덮지 않게 표만 넘긴다.
      loadToken++;
    } finally {
      set({ deleting: false });
    }
  },
}));
