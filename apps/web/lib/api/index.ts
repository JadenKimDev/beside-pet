/**
 * lib/api/index.ts — the backend port.
 * The app always talks to the real backend (beside-pet-api) over HTTP/SSE;
 * there is no offline or mock mode. Components/stores only ever see `api`.
 */
import { httpApi } from './http';
import type { Api } from './types';

export const api: Api = httpApi;

export type {
  Api,
  DailyState,
  DoneEvent,
  EatingState,
  GriefPath,
  GriefProfile,
  HistoryMessage,
  LossType,
  MetaEvent,
  MindReport,
  ReportSection,
  ReportSectionKey,
  SessionListItem,
  SessionStateView,
  SituationType,
  SleepState,
  StartRequest,
  StreamEvent,
  SupportLevel,
  TaskId,
  TogetherRange,
  TokenEvent,
  TurnResult,
} from './types';
