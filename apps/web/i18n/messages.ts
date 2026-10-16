/**
 * i18n/messages.ts — the message-catalog shape.
 * Every locale catalog must satisfy `Messages`, so a missing or extra key
 * is a build error. Entries that need runtime values are functions.
 */
import type {
  GriefPath,
  LossType,
  ReportSectionKey,
  SituationType,
  SleepState,
  TaskId,
  TogetherRange,
} from '@/lib/api';

export interface Messages {
  landing: {
    title: string;
    subtitleLine1: string;
    subtitleLine2: string;
    start: string;
  };
  auth: {
    title: string;
    subtitle: string;
    username: string;
    password: string;
    submit: string;
    signingIn: string;
    logout: string;
    setupTitle: string;
    setupSubtitle: string;
    setupToken: string;
    setupTokenHint: string;
    setupSubmit: string;
    settingUp: string;
    chatLanguage: string;
    registerLink: string;
    registerTitle: string;
    registerSubtitle: string;
    company: string;
    registerSubmit: string;
    registering: string;
    registerDone: string;
    backToLogin: string;
  };
  chat: {
    placeholder: string;
    send: string;
    skip: string;
  };
  onboarding: {
    askName: string;
    askLanguage: string;
    askDuration: (petName: string) => string;
    askLoss: (petName: string) => string;
    askSituation: (petName: string) => string;
    askPath: (petName: string) => string;
    askSleep: string;
    closing: string;
    placeholderName: string;
    begin: string;
    defaultPetName: string;
    duration: Record<TogetherRange, string>;
    loss: Record<LossType, string>;
    situation: Record<SituationType, string>;
    path: Record<GriefPath, string>;
    sleep: Record<SleepState, string>;
  };
  /** Stage names. The backend sends the stage id; naming it is the client's job. */
  taskLabels: Record<TaskId, string>;
  /** Mind-report card titles, keyed by the section the backend sends. */
  reportSections: Record<ReportSectionKey, string>;
  session: {
    noSession: string;
    toHome: string;
    closed: string;
    progressFallback: string;
    toList: string;
    endConversation: string;
    confirmEndTitle: string;
    confirmEndBody: string;
    confirmEnd: string;
    cancel: string;
  };
  sessionList: {
    title: string;
    subtitle: string;
    continueButton: string;
    newButton: string;
    ongoing: string;
    done: string;
    loading: string;
    settings: string;
    noOpenHint: string;
    confirmNewTitle: string;
    confirmNewBody: string;
    confirmNewStart: string;
    cancel: string;
    viewTranscript: string;
    viewReport: string;
    deleteConversation: string;
    confirmDeleteTitle: string;
    confirmDeleteBody: string;
    confirmDelete: string;
  };
  sessionDetail: {
    back: string;
    loading: string;
    loadFailed: string;
    reportTitle: string;
    reportLoading: string;
    reportFailed: string;
    reportNotReady: string;
    continueButton: string;
    ongoing: string;
    done: string;
  };
  settings: {
    title: string;
    back: string;
    uiLanguage: string;
    chatLanguageHint: string;
    account: string;
    signedInAs: (username: string) => string;
  };
  admin: {
    title: string;
    signedInAs: (username: string) => string;
    empty: string;
    columnUsername: string;
    columnCompany: string;
    columnStatus: string;
    columnExpiry: string;
    columnLastLogin: string;
    columnActions: string;
    statusPending: string;
    statusActive: string;
    statusRevoked: string;
    statusDeleted: string;
    statusExpired: string;
    approve: string;
    revoke: string;
    reactivate: string;
    delete: string;
    setExpiry: string;
    clearExpiry: string;
    formUsername: string;
    formPassword: string;
    formCompany: string;
    formExpiry: string;
    formSubmit: string;
  };
  safety: {
    title: string;
    body: string;
    hotlineNumber: string;
  };
}
