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

/** A heading with one sentence under it (feature cards, promises). */
export interface TitledText {
  title: string;
  body: string;
}

/** One phone line on the help page, crisis card and footer. Numbers are the
 * same in every locale and must match the server's `GET /v1/safety/resources`. */
export interface HelpLine {
  /** As dialled and shown, e.g. "1577-1366". `tel:` links strip the hyphens. */
  number: string;
  name: string;
  hours: string;
}

export interface Messages {
  landing: {
    title: string;
    start: string;
    eyebrow: string;
    /** Contains one "\n" where the title breaks. */
    heroTitle: string;
    heroLead: string;
    trust: [string, string, string];
    featuresEyebrow: string;
    featuresTitle: string;
    feature1: TitledText;
    feature2: TitledText;
    feature3: TitledText;
    stepsEyebrow: string;
    stepsTitle: string;
    stepsDesc: [string, string, string, string];
    promise: [TitledText, TitledText, TitledText];
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
    welcome: string;
    noAccount: string;
    loginFailed: string;
    companyHint: string;
    chatLanguageHint: string;
    registerDoneTitle: string;
    /** Accessible name of the card skeleton while the sign-in state is checked. */
    checking: string;
    /** Shown under the password on the sign-up form (the server needs 8+). */
    passwordHint: string;
  };
  chat: {
    placeholder: string;
    send: string;
    skip: string;
    title: (petName: string) => string;
    waitHint: string;
    enterHint: string;
    typing: string;
    sendFailed: string;
    resend: string;
    stage: (step: number, stage: string) => string;
    newReply: string;
    closedTitle: string;
    closedBody: string;
    openReport: string;
    /** Header title: who the conversation is about, then the current stage. */
    titleWithStage: (petName: string, stage: string) => string;
    /** Read by screen readers on the progress stones, e.g. step 3 of 4. */
    progressText: (step: number, stage: string) => string;
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
    companion: string;
    askLanguageHint: string;
    skip: string;
    skipAnyHint: string;
    nameHint: string;
    pathSkipHint: string;
    pathAfterDesc: string;
    pathBeforeDesc: string;
    artCaption: string;
    artCaptionAfter: string;
    artCaptionBefore: string;
    step: (step: number, total: number) => string;
    summary: {
      pet: string;
      together: string;
      now: string;
      chatLanguage: string;
    };
    beginHint: string;
    next: string;
    summaryUnanswered: string;
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
    /** "Cancel" on the wrap-up confirmation: reads as "keep talking". */
    cancel: string;
    /** The greeting could not be fetched. */
    startFailed: string;
    startFailedBody: string;
  };
  sessionList: {
    title: string;
    subtitle: string;
    continueButton: string;
    ongoing: string;
    done: string;
    loading: string;
    confirmNewTitle: string;
    confirmNewBody: string;
    confirmNewStart: string;
    cancel: string;
    viewTranscript: string;
    viewReport: string;
    /** The item's more-menu: view the transcript. */
    menuView: string;
    deleteConversation: string;
    confirmDeleteTitle: string;
    /** Without the date; prefer `confirmDeleteBodyDated` when the date is known. */
    confirmDeleteBody: string;
    confirmDeleteBodyDated: (date: string) => string;
    confirmDelete: string;
    greeting: (name: string) => string;
    currentTitle: (petName: string, step: number) => string;
    stepOf: (step: number) => string;
    lastActive: (time: string) => string;
    newShort: string;
    noOpenTitle: string;
    noOpenBody: string;
    noOpenCta: string;
    walked: (steps: number) => string;
    pastTitle: string;
    count: (count: number) => string;
    reachedUntil: (stage: string) => string;
    itemMeta: (when: string, petName: string, minutes: number, messages: number) => string;
    itemStats: (minutes: number, messages: number) => string;
    reportLocked: string;
    more: string;
    emptyTitle: string;
    emptyBody: string;
    emptyCta: string;
    failedTitle: string;
    failedBody: string;
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
    /** Reassurance under the load failure. */
    loadFailedBody: string;
  };
  settings: {
    title: string;
    back: string;
    uiLanguage: string;
    chatLanguageHint: string;
    account: string;
    signedInAs: (username: string) => string;
    groupChat: string;
    groupAccount: string;
    groupHelp: string;
    uiLanguageHint: string;
    theme: string;
    themeHint: string;
    themeNames: Record<'hanji' | 'night' | 'ink', string>;
    signedIn: string;
    helpLink: string;
  };
  report: {
    eyebrow: string;
    title: (petName: string) => string;
    /** 표지의 날짜 줄. `reached` 는 `reachedStep` 의 한 칸. 대화한 시간(분)은 서버가 아직 주지 않아 뺀다(§11). */
    meta: (date: string, reached: string) => string;
    /** 도달한 걸음(1..4)의 말. */
    reachedStep: [string, string, string, string];
    stepsShort: [string, string, string, string];
    stepsLabel: string;
    signature: string;
    print: string;
    writeOnce: string;
    writingHint: string;
    writingTitle: string;
    notReadyTitle: string;
    notReadyBody: string;
    failedTitle: string;
    failedBody: string;
    retry: string;
    revisit: string;
    toList: string;
  };
  /** Fixed helpline copy shared by the help page, crisis card and footer (ADR-0004). */
  safety: {
    title: string;
    body: string;
    /** @deprecated Use `lines[0].number`. */
    hotlineNumber: string;
    /** 109 then 1577-1366. */
    lines: [HelpLine, HelpLine];
    call: string;
    /** The "112 or 119" line. */
    emergency: string;
  };
  /** The crisis card under a supportLevel-3 reply. */
  crisis: {
    title: string;
    lead: string;
    /** Shown in place of the composer once the card appears. */
    stopped: string;
    toList: string;
    toHelp: string;
  };
  /** The public `/help` page and the header pill that leads to it. */
  help: {
    pill: string;
    pillShort: string;
    eyebrow: string;
    title: string;
    lead: string;
    toHome: string;
  };
  nav: {
    conversations: string;
    settings: string;
  };
  footer: {
    crisis: string;
    more: string;
    /** ADR-0003's negative-form exception: the only place banned words may appear. */
    disclaimer: string;
  };
  common: {
    reload: string;
    retry: string;
  };
  toast: {
    deleted: string;
    deleteFailed: string;
    endFailed: string;
    chatLanguageSaved: (language: string) => string;
    saveFailed: string;
  };
}
