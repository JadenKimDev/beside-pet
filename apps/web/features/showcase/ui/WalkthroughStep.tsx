'use client';

import { Badge, cx, Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import type { Messages } from '@/i18n/messages';
import type { ReportSection, Transcript, TranscriptStep, TranscriptTurn } from '../model/types';

/** 쇼케이스 자료의 리포트 칸 이름 → 리포트 화면이 쓰는 칸 이름(문구 키). */
const SECTION_KEY: Record<ReportSection, keyof Messages['reportSections']> = {
  journey: 'journey',
  emotions: 'emotions',
  keepsakes: 'keepsake',
  encouragement: 'encouragement',
};

/**
 * 대화 한 사이클의 한 장. 넓은 폭에서는 스크린샷(왼쪽)과 단계·전사(오른쪽)가 나란히, 좁은 폭에서는
 * 단계 → 스크린샷 → 전사 순으로 쌓인다. 스크린샷 틀은 한 비율(1500×777)로 두고 이미지는 위를 맞춰 채운다(조금 더 넓은 리포트 화면은 양옆의 빈 바탕만 잘린다)
 * (폭이 다른 스크린샷도 같은 틀). 틀에는 바탕을 깔아 이미지가 아직 없어도 모양이 남는다.
 */
export function WalkthroughStep({
  step,
  src,
  index,
  total,
  transcript,
}: {
  step: TranscriptStep;
  /** 스크린샷의 웹 경로. 경로를 만드는 함수는 서버 쪽 읽기 모듈에 있어 page 가 만들어 넘긴다. */
  src: string;
  index: number;
  total: number;
  transcript: Transcript;
}) {
  const translations = useTranslations();
  const copy = translations.showcase;
  const label = step.kind === 'chat' ? (step.stage ?? '') : copy.stepKind[step.kind];
  // 범위가 이웃 장과 겹쳐도 그 장의 범위를 그대로 보인다(스크린샷에 보이는 말 그대로).
  const [first, last] = step.turns ?? [0, -1];
  const turns = transcript.turns
    .map((turn, at) => ({ turn, at }))
    .filter(({ at }) => at >= first && at <= last);

  return (
    <li className="grid min-w-0 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-small font-semibold text-fg-muted tabular-nums">
            {copy.stepCount(index, total)}
          </span>
          {label && <Badge tone={step.kind === 'chat' ? 'live' : 'default'}>{label}</Badge>}
        </div>
        <h3 className="m-0 mt-2 text-h3 font-semibold text-fg">{step.caption}</h3>
      </div>

      <a
        href={src}
        target="_blank"
        rel="noopener"
        className="relative block aspect-[1500/777] min-w-0 overflow-hidden rounded-lg border border-border bg-linear-160 from-warm via-accent-soft to-dusk shadow-1 focus-visible:shadow-focus focus-visible:outline-none lg:col-start-1 lg:row-span-2 lg:row-start-1"
      >
        {/* biome-ignore lint/performance/noImgElement: 스크린샷은 빌드 때 복사된 정적 WebP 를 그대로 쓴다(최적화기를 거치지 않는다). */}
        <img
          src={src}
          alt={step.caption}
          loading={index <= 2 ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 size-full object-cover object-top"
        />
      </a>

      <div className="grid min-w-0 content-start gap-3 lg:col-start-2 lg:row-start-2">
        {turns.map(({ turn, at }) => (
          <TurnBubble key={at} turn={turn} speaker={copy.speaker[turn.role]} />
        ))}
        <StepDetail step={step} transcript={transcript} />
      </div>
    </li>
  );
}

function TurnBubble({ turn, speaker }: { turn: TranscriptTurn; speaker: string }) {
  const isUser = turn.role === 'user';
  return (
    <div className={cx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <p
        className={cx(
          'm-0 max-w-[92%] rounded-bubble px-4 py-2.5 text-[15px] leading-[1.7] whitespace-pre-wrap break-words text-fg',
          isUser
            ? 'rounded-br-[6px] bg-accent-soft'
            : 'rounded-bl-[6px] border border-border bg-surface shadow-1',
        )}
      >
        <span className="sr-only">{speaker}: </span>
        {turn.text}
      </p>
    </div>
  );
}

/** 대화 밖의 장: 마친 뒤의 안내, 리포트의 그 칸 글, 목록의 카드. 같은 글이 이미지 밖에도 있게 한다. */
function StepDetail({ step, transcript }: { step: TranscriptStep; transcript: Transcript }) {
  const translations = useTranslations();
  const card = 'rounded-lg border border-border bg-surface p-5 shadow-1';

  // 안내 카드는 대화를 마친 화면(마지막 말이 함께 보이는 장)에만 있다. 확인 대화상자의 장에는 없다.
  if (step.kind === 'closing' && step.turns) {
    return (
      <div className={card}>
        <p className="m-0 flex items-center gap-2 font-semibold text-fg [&_svg]:size-4 [&_svg]:text-accent-ink">
          <Icon name="check" />
          {transcript.closing_notice.title}
        </p>
        <p className="m-0 mt-1.5 text-sm text-fg-muted">{transcript.closing_notice.body}</p>
      </div>
    );
  }

  if (step.kind === 'report' && step.report_section) {
    const report = transcript.report;
    const section = step.report_section;
    return (
      <div className={card}>
        {section === 'journey' && (
          <div className="mb-4 border-b border-border pb-4">
            <p className="m-0 font-serif text-h3 font-bold text-fg">{report.title}</p>
            <p className="m-0 mt-1 text-small text-fg-muted">{report.subtitle}</p>
          </div>
        )}
        <p className="m-0 text-eyebrow font-semibold tracking-[.12em] text-accent-ink uppercase">
          {translations.reportSections[SECTION_KEY[section]]}
        </p>
        <p className="m-0 mt-2 text-[15px] leading-[1.8] text-fg">{report[section]}</p>
        {section === 'emotions' && report.emotion_tags.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
            {report.emotion_tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        {section === 'encouragement' && (
          <>
            <p className="m-0 mt-3 text-right font-serif text-fg-muted">{report.signature}</p>
            <p className="m-0 mt-4 border-t border-border pt-3 text-small text-fg-muted">
              {report.footnote}
            </p>
          </>
        )}
      </div>
    );
  }

  if (step.kind === 'list') {
    const item = transcript.sessions_list_card;
    return (
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 font-semibold text-fg">{item.title}</p>
          <Badge>{item.badge}</Badge>
        </div>
        <p className="m-0 mt-1.5 text-small text-fg-muted">{item.meta}</p>
      </div>
    );
  }

  return null;
}
