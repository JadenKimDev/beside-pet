'use client';

import './onboarding.css';
import { useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/config';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import { getMessages } from '@/i18n/registry';
import type { GriefProfile } from '@/lib/api';
import { useOnboardingStore } from '../onboarding.store';
import type { ChoiceOption } from '../onboarding.types';
import { artFor } from './illustration';
import { OnboardingArt } from './OnboardingArt';
import {
  Choices,
  NameEntry,
  PathCards,
  Progress,
  SkipFoot,
  Speaker,
  SummaryRow,
  Trail,
} from './OnboardingParts';
import { pathDecided, QUESTION_TOTAL, questionNumber } from './progress';

// 스토어가 건너뛰기를 적는 글(chat.skip)은 언어마다 다르다. 흔적 배지에서는 뺀다.
const SKIP_TEXTS = new Set(LOCALES.map((locale) => getMessages(locale).chat.skip));

/**
 * 온보딩: 한 화면에 질문 하나. 단계와 결과 프로필은 스토어(onboarding.store.ts)가 정하고,
 * 이 화면은 지금 질문과 진행 표시, 흔적 배지, 삽화만 그린다. 뒤로 가기는 두지 않는다.
 *
 * 질문과 선택지는 고른 대화 언어로(스토어가 그 언어의 카탈로그로 만든다), 버튼·안내·요약 이름은
 * 화면 언어로 그린다. 둘은 따로 정하는 설정이다.
 */
export function OnboardingFlow({
  onChooseLanguage,
  onBegin,
}: {
  /** 언어 질문에 답하면 계정의 대화 언어 설정으로 넘긴다. */
  onChooseLanguage?: (locale: Locale) => void;
  /** 마무리에서 "이야기 시작하기"를 누르면 결과 프로필(대화 언어를 채운 것)을 넘긴다. */
  onBegin: (profile: GriefProfile) => void;
}) {
  const translations = useTranslations();
  const { locale } = useLocale();
  const messages = useOnboardingStore((state) => state.messages);
  const status = useOnboardingStore((state) => state.status);
  const stepIndex = useOnboardingStore((state) => state.stepIndex);
  const griefProfile = useOnboardingStore((state) => state.griefProfile);
  const input = useOnboardingStore((state) => state.input);
  const start = useOnboardingStore((state) => state.start);
  const answer = useOnboardingStore((state) => state.answer);
  const select = useOnboardingStore((state) => state.select);
  const skip = useOnboardingStore((state) => state.skip);

  const chatLocale = griefProfile.preferredLanguage ?? locale;
  const chatMessages = getMessages(chatLocale);
  const text = translations.onboarding;
  const done = status === 'done';

  // 들어오면 첫 질문(store.start 는 두 번 불려도 한 번만 한다).
  useEffect(() => {
    start(chatMessages);
  }, [start, chatMessages]);

  const question = [...messages].reverse().find((message) => message.role === 'bot')?.text ?? '';
  const trail = messages
    .filter((message) => message.role === 'user' && !SKIP_TEXTS.has(message.text))
    .map((message) => message.text);

  // 답한 언어는 계정의 대화 언어가 되고, 남은 질문은 바로 그 언어로 잇는다.
  const onSelect = (option: ChoiceOption) => {
    const chosen = option.patch.preferredLanguage;
    if (chosen) {
      onChooseLanguage?.(chosen);
      select(getMessages(chosen), option);
    } else {
      select(chatMessages, option);
    }
  };
  const onSkip = () => skip(chatMessages);
  const onName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed) answer(chatMessages, trimmed);
    else onSkip();
  };

  const decided = pathDecided(stepIndex, done);
  const art = decided ? artFor(griefProfile.griefPath) : 'hero';
  const caption = !decided
    ? text.artCaption
    : griefProfile.griefPath === 'beforeLoss'
      ? text.artCaptionBefore
      : text.artCaptionAfter;

  const options = input?.kind === 'choice' ? input.options : [];
  const isLanguage = options.some((option) => option.patch.preferredLanguage);
  const isPath = options.some((option) => option.patch.griefPath);
  const footHint =
    input?.kind === 'text' ? text.nameHint : isPath ? text.pathSkipHint : text.skipAnyHint;

  const renderAnswer = () => {
    if (input?.kind === 'text') {
      return <NameEntry placeholder={input.placeholder} nextLabel={text.next} onNext={onName} />;
    }
    if (isPath) {
      return (
        <PathCards
          options={options}
          describe={(path) =>
            path === 'beforeLoss'
              ? chatMessages.onboarding.pathBeforeDesc
              : chatMessages.onboarding.pathAfterDesc
          }
          onSelect={onSelect}
        />
      );
    }
    return <Choices options={options} onSelect={onSelect} />;
  };

  return (
    <main className="grid min-h-[calc(100vh-64px)] w-full flex-1 grid-cols-[5fr_6fr] max-sm:min-h-0 max-sm:flex-none max-sm:grid-cols-1 max-sm:content-start">
      <OnboardingArt art={art} caption={caption} />

      <div className="flex min-w-0 max-w-[680px] flex-col px-16 pt-10 pb-8 max-lg:p-8 max-sm:px-4 max-sm:pt-5 max-sm:pb-6">
        {!done && (
          <>
            <Progress
              number={questionNumber(stepIndex)}
              label={text.step(questionNumber(stepIndex), QUESTION_TOTAL)}
            />
            <Trail answers={trail} />
          </>
        )}

        <section
          key={`${stepIndex}-${status}`}
          className="onboarding-rise my-auto pt-8 max-sm:mt-2 max-sm:pt-4"
        >
          <Speaker name={text.companion} />
          <h1 className="mt-4 mb-7 text-[30px] leading-normal font-normal tracking-[-0.005em] max-sm:mt-3 max-sm:mb-5 max-sm:text-[23px]">
            {done ? chatMessages.onboarding.closing : question}
          </h1>

          {done ? (
            <>
              <dl className="m-0 mb-7 grid gap-2.5 rounded-lg bg-bg-sunk px-[22px] py-5 text-sm">
                <SummaryRow term={text.summary.pet}>
                  {griefProfile.petName ?? text.summaryUnanswered}
                </SummaryRow>
                <SummaryRow term={text.summary.together}>
                  {griefProfile.togetherRange
                    ? chatMessages.onboarding.duration[griefProfile.togetherRange]
                    : text.summaryUnanswered}
                </SummaryRow>
                <SummaryRow term={text.summary.now}>
                  {chatMessages.onboarding.path[griefProfile.griefPath]}
                </SummaryRow>
                <SummaryRow term={text.summary.chatLanguage}>
                  {LOCALE_LABELS[chatLocale]}
                </SummaryRow>
              </dl>
              <Button
                size="lg"
                block
                iconEnd={<Icon name="arrow-right" />}
                onClick={() => onBegin({ ...griefProfile, preferredLanguage: chatLocale })}
              >
                {text.begin}
              </Button>
              <p className="mt-3 mb-0 text-center text-xs text-fg-muted">{text.beginHint}</p>
            </>
          ) : (
            <>
              {isLanguage && (
                <p className="-mt-4 mb-7 text-[15px] text-fg-muted">{text.askLanguageHint}</p>
              )}
              {renderAnswer()}
              <SkipFoot hint={footHint} skipLabel={text.skip} onSkip={onSkip} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
