// 공개 쇼케이스(/showcase)가 그리는 정적 자료의 모양. 정본은 레포 루트의 showcase/ 이고
// 빌드와 dev 때 apps/web/public/showcase/ 로 복사된다(package.json 의 prebuild, predev).

export type TranscriptRole = 'user' | 'companion';

export interface TranscriptTurn {
  role: TranscriptRole;
  text: string;
  /** 서버가 붙인 단계 이름. 예: "2/4 슬픔의 감정 마주하기". */
  stage: string;
}

export type TranscriptStepKind = 'onboarding' | 'chat' | 'closing' | 'report' | 'list';

export type ReportSection = 'journey' | 'emotions' | 'keepsakes' | 'encouragement';

export interface TranscriptStep {
  id: string;
  /** showcase/pomo/ 안의 파일 이름. 화면은 screenshotPath 로 경로를 만든다. */
  screenshot: string;
  caption: string;
  stage?: string;
  /** 스크린샷에 보이는 턴의 범위 [시작, 끝] (turns 의 index, 양끝 포함). 턴이 없는 화면은 null. */
  turns: [number, number] | null;
  kind: TranscriptStepKind;
  /** kind 가 report 일 때 그 장이 보이는 리포트 칸. */
  report_section?: ReportSection;
}

export interface Report {
  title: string;
  subtitle: string;
  journey: string;
  emotions: string;
  emotion_tags: string[];
  keepsakes: string;
  encouragement: string;
  signature: string;
  footnote: string;
}

export interface Transcript {
  /** 모든 글이 지어낸 것임을 뜻한다. 늘 true. */
  fictional: true;
  note: string;
  pet: { name: string; kind: string; age: number };
  /** 자료를 만든 계정의 내부 메모. 화면에 쓰지 않는다. */
  account: string;
  date: string;
  turns: TranscriptTurn[];
  closing_notice: { title: string; body: string };
  report: Report;
  sessions_list_card: { title: string; badge: string; meta: string };
  steps: TranscriptStep[];
}

export type DevNoteKind = 'bug' | 'feature' | 'improvement' | 'planned';

export interface DevNote {
  /** YYYY-MM-DD */
  date: string;
  kind: DevNoteKind;
  title: string;
  body: string;
  /** 내부 추적용 이슈 번호. 화면에 보이지 않는다. */
  issue: number;
}

export interface DevNotes {
  note: string;
  entries: DevNote[];
}
