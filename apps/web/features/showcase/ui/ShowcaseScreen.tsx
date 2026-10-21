'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';
import type { DevNote, Transcript } from '../model/types';
import { DevNotesList } from './DevNotesList';
import { WalkthroughStep } from './WalkthroughStep';

/**
 * 공개 쇼케이스(/showcase). 정적: 서버를 부르지 않고 인증 상태를 보지 않는다. 자료는 page 가 읽어 넘긴다.
 * 순서: 소개와 "지어낸 대화" 안내 → 대화 한 사이클(스크린샷 + 전사) → 개발 기록.
 */
export function ShowcaseScreen({
  transcript,
  screenshots,
  notes,
}: {
  transcript: Transcript;
  /** 장(step id)마다 스크린샷의 웹 경로. page 가 screenshotPath 로 만든다. */
  screenshots: Readonly<Record<string, string>>;
  notes: readonly DevNote[];
}) {
  const translations = useTranslations();
  const copy = translations.showcase;
  const total = transcript.steps.length;

  const toHome = (
    <Link
      href="/"
      className="inline-flex items-center gap-1 text-accent-ink underline underline-offset-[3px] max-sm:min-h-11 [&_svg]:size-3.5"
    >
      <Icon name="chev-left" />
      {copy.toHome}
    </Link>
  );

  return (
    <main className="mx-auto w-full max-w-wide min-w-0 flex-1 px-8 pt-10 pb-20 max-sm:px-4 max-sm:pt-7">
      <div className="max-w-read">
        <p className="m-0 text-eyebrow font-semibold tracking-[.12em] text-accent-ink uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="m-0 mt-2.5 font-serif text-display-s font-bold">{copy.title}</h1>
        <p className="m-0 mt-4 text-lead text-fg-muted">{copy.lead}</p>
        <p className="m-0 mt-6 flex items-start gap-2.5 rounded-lg bg-bg-sunk p-4 text-sm leading-[1.7] text-fg [&_svg]:mt-[3px] [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-accent-ink">
          <Icon name="paw" />
          <span>{copy.fictional(transcript.pet.name, transcript.pet.age)}</span>
        </p>
        <p className="m-0 mt-5">{toHome}</p>
      </div>

      <section aria-labelledby="showcase-walkthrough" className="mt-14 max-sm:mt-10">
        <h2 id="showcase-walkthrough" className="m-0 font-serif text-h1 font-bold">
          {copy.walkthroughTitle}
        </h2>
        <p className="m-0 mt-2 max-w-read text-fg-muted">{copy.walkthroughLead}</p>
        <ol className="m-0 mt-8 grid list-none gap-12 p-0 max-sm:gap-10">
          {transcript.steps.map((step, index) => (
            <WalkthroughStep
              key={step.id}
              step={step}
              src={screenshots[step.id] ?? ''}
              index={index + 1}
              total={total}
              transcript={transcript}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="showcase-dev-notes" className="mt-16 max-w-read max-sm:mt-12">
        <h2 id="showcase-dev-notes" className="m-0 font-serif text-h1 font-bold">
          {copy.devNotesTitle}
        </h2>
        <p className="m-0 mt-2 text-fg-muted">{copy.devNotesLead}</p>
        <DevNotesList notes={notes} />
      </section>

      <p className="m-0 mt-12">{toHome}</p>
    </main>
  );
}
