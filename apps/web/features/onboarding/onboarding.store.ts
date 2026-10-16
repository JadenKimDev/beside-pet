/**
 * features/onboarding/onboarding.store.ts — scripted conversational onboarding.
 * The companion asks one scripted question at a time and collects answers into
 * a GriefProfile. Conversational, not a form — every question is skippable.
 *
 * The path (already-passed vs still-with-you) is asked early because it branches
 * the rest: a step may declare `when` and is skipped if it doesn't apply. So the
 * afterLoss path asks the loss reason, while the beforeLoss path asks the current
 * situation — the questions never contradict each other.
 *
 * Input modes:
 *  - text steps: free input is interpreted by step.parse.
 *  - choice steps: each chip carries its own GriefProfile value (patch), applied directly.
 *
 * This store is non-React, so the catalog `translations` is passed into actions.
 * The only remaining locale-coupled free-text parser is the sleep step.
 */
import { create } from 'zustand';
import type { Message } from '@/components/chat/types';
import { LOCALE_LABELS, LOCALES } from '@/i18n/config';
import type { Messages } from '@/i18n/messages';
import type {
  GriefPath,
  GriefProfile,
  LossType,
  SituationType,
  SleepState,
  TogetherRange,
} from '@/lib/api';
import type { ChoiceOption, OnboardingStatus, StepInput } from './onboarding.types';

const SKIP = /skip/i;

const PATHS: GriefPath[] = ['afterLoss', 'beforeLoss'];
const DURATIONS: TogetherRange[] = ['0-3', '4-7', '8-11', '12+'];
const LOSSES: LossType[] = ['sudden', 'illness', 'natural', 'euthanasia', 'unknown'];
const SITUATIONS: SituationType[] = ['aging', 'endOfLife', 'ongoingCare', 'other'];
const SLEEPS: SleepState[] = ['ok', 'fair', 'disturbed'];

const petNameOf = (translations: Messages, griefProfile: GriefProfile): string =>
  griefProfile.petName ?? translations.onboarding.defaultPetName;

interface BaseStep {
  ask: (translations: Messages, griefProfile: GriefProfile) => string;
  /** If present and false for the current griefProfile, the step is skipped. */
  when?: (griefProfile: GriefProfile) => boolean;
}
type TextStep = BaseStep & {
  kind: 'text';
  placeholder: (translations: Messages) => string;
  parse: (text: string) => Partial<GriefProfile>;
};
type ChoiceStep = BaseStep & {
  kind: 'choice';
  options: (translations: Messages) => ChoiceOption[];
};
type Step = TextStep | ChoiceStep;

const isAfterLoss = (griefProfile: GriefProfile): boolean => griefProfile.griefPath === 'afterLoss';
const isBeforeLoss = (griefProfile: GriefProfile): boolean =>
  griefProfile.griefPath === 'beforeLoss';

const STEPS: Step[] = [
  {
    // Language first: choosing it switches the whole app + the rest of onboarding.
    kind: 'choice',
    ask: (translations) => translations.onboarding.askLanguage,
    options: () =>
      LOCALES.map((value) => ({
        label: LOCALE_LABELS[value],
        patch: { preferredLanguage: value },
      })),
  },
  {
    kind: 'text',
    ask: (translations) => translations.onboarding.askName,
    placeholder: (translations) => translations.onboarding.placeholderName,
    parse: (text) => (SKIP.test(text) ? {} : { petName: text.trim() }),
  },
  {
    kind: 'choice',
    ask: (translations, griefProfile) =>
      translations.onboarding.askPath(petNameOf(translations, griefProfile)),
    options: (translations) =>
      PATHS.map((value) => ({
        label: translations.onboarding.path[value],
        patch: { griefPath: value },
      })),
  },
  {
    kind: 'choice',
    ask: (translations, griefProfile) =>
      translations.onboarding.askDuration(petNameOf(translations, griefProfile)),
    options: (translations) =>
      DURATIONS.map((value) => ({
        label: translations.onboarding.duration[value],
        patch: { togetherRange: value },
      })),
  },
  {
    kind: 'choice',
    when: isAfterLoss,
    ask: (translations, griefProfile) =>
      translations.onboarding.askLoss(petNameOf(translations, griefProfile)),
    options: (translations) =>
      LOSSES.map((value) => ({
        label: translations.onboarding.loss[value],
        patch: { lossType: value },
      })),
  },
  {
    kind: 'choice',
    when: isBeforeLoss,
    ask: (translations, griefProfile) =>
      translations.onboarding.askSituation(petNameOf(translations, griefProfile)),
    options: (translations) =>
      SITUATIONS.map((value) => ({
        label: translations.onboarding.situation[value],
        patch: { situation: value },
      })),
  },
  {
    kind: 'choice',
    ask: (translations) => translations.onboarding.askSleep,
    options: (translations) =>
      SLEEPS.map((value) => ({
        label: translations.onboarding.sleep[value],
        patch: { dailyState: { sleep: value } },
      })),
  },
];

/** Next step index that applies to the given griefProfile (skips `when`-excluded steps). */
const nextApplicableIndex = (fromIndex: number, griefProfile: GriefProfile): number => {
  let index = fromIndex + 1;
  while (index < STEPS.length) {
    const candidate = STEPS[index];
    if (!candidate.when || candidate.when(griefProfile)) break;
    index += 1;
  }
  return index;
};

const inputOf = (step: Step, translations: Messages): StepInput =>
  step.kind === 'text'
    ? { kind: 'text', placeholder: step.placeholder(translations) }
    : { kind: 'choice', options: step.options(translations) };

interface OnboardingState {
  messages: Message[];
  stepIndex: number;
  griefProfile: GriefProfile;
  status: OnboardingStatus;
  input?: StepInput;
  start: (translations: Messages) => void;
  answer: (translations: Messages, text: string) => void; // text input
  select: (translations: Messages, option: ChoiceOption) => void; // chip selection
  skip: (translations: Messages) => void; // skip current question
  reset: () => void;
}

const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}`;
const botMessage = (text: string): Message => ({ id: newId(), role: 'bot', text });
const userMessage = (text: string): Message => ({ id: newId(), role: 'user', text });

// preferredLanguage is filled from the app locale at session start (see the
// onboarding page); it's left unset here so it always matches the chosen UI language.
const freshGriefProfile = (): GriefProfile => ({ griefPath: 'afterLoss' });

export const useOnboardingStore = create<OnboardingState>((set, get) => {
  /** Advance with the displayed answer text and the GriefProfile patch it means. */
  const advance = (
    translations: Messages,
    displayText: string,
    patch: Partial<GriefProfile>,
  ): void => {
    const { stepIndex, griefProfile, status } = get();
    if (status === 'done') return;

    const nextGriefProfile: GriefProfile = { ...griefProfile, ...patch };
    const nextIndex = nextApplicableIndex(stepIndex, nextGriefProfile);
    const nextStep = nextIndex < STEPS.length ? STEPS[nextIndex] : undefined;
    const nextBot = nextStep
      ? nextStep.ask(translations, nextGriefProfile)
      : translations.onboarding.closing;

    set((state) => ({
      messages: [...state.messages, userMessage(displayText), botMessage(nextBot)],
      griefProfile: nextGriefProfile,
      stepIndex: nextIndex,
      status: nextStep ? 'active' : 'done',
      input: nextStep ? inputOf(nextStep, translations) : undefined,
    }));
  };

  return {
    messages: [],
    stepIndex: 0,
    griefProfile: freshGriefProfile(),
    status: 'active',
    input: undefined,

    start(translations) {
      if (get().messages.length > 0) return; // idempotent (guards StrictMode double-call)
      const first = STEPS[0];
      set({
        messages: [botMessage(first.ask(translations, get().griefProfile))],
        input: inputOf(first, translations),
      });
    },

    answer(translations, text) {
      const step = STEPS[get().stepIndex];
      advance(translations, text, step.kind === 'text' ? step.parse(text) : {});
    },

    select(translations, option) {
      advance(translations, option.label, option.patch);
    },

    skip(translations) {
      advance(translations, translations.chat.skip, {});
    },

    reset() {
      set({
        messages: [],
        stepIndex: 0,
        griefProfile: freshGriefProfile(),
        status: 'active',
        input: undefined,
      });
    },
  };
});
