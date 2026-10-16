'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChoiceChips } from '@/components/chat/ChoiceChips';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { useAuthStore } from '@/features/auth/auth.store';
import { useOnboardingStore } from '@/features/onboarding/onboarding.store';
import type { ChoiceOption } from '@/features/onboarding/onboarding.types';
import { useSessionStore } from '@/features/session/session.store';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import { getMessages } from '@/i18n/registry';

export default function OnboardingPage() {
  const translations = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const setChatLanguage = useAuthStore((state) => state.setChatLanguage);
  const messages = useOnboardingStore((state) => state.messages);
  const status = useOnboardingStore((state) => state.status);
  const griefProfile = useOnboardingStore((state) => state.griefProfile);
  const input = useOnboardingStore((state) => state.input);
  const start = useOnboardingStore((state) => state.start);
  const answer = useOnboardingStore((state) => state.answer);
  const select = useOnboardingStore((state) => state.select);
  const skip = useOnboardingStore((state) => state.skip);
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const startSession = useSessionStore((state) => state.startSession);

  // The onboarding chat speaks the chosen conversation language; the app UI
  // language (locale cookie) is a separate setting and stays untouched here.
  const chatLocale = griefProfile.preferredLanguage ?? locale;
  const chatMessages = getMessages(chatLocale);

  // First question on entry (store.start is idempotent).
  useEffect(() => {
    start(chatMessages);
  }, [start, chatMessages]);

  // The language answer becomes the account-level chat-language setting and the
  // rest of the onboarding script continues in that language (no one-question lag).
  const onSelect = (option: ChoiceOption) => {
    const chosen = option.patch.preferredLanguage;
    if (chosen) {
      void setChatLanguage(chosen);
      select(getMessages(chosen), option);
    } else {
      select(chatMessages, option);
    }
  };

  const beginSession = () => {
    // Kick off the session (sets status synchronously) and navigate immediately
    // so the greeting streams on the session screen rather than off-screen here.
    void startSession({
      ...griefProfile,
      preferredLanguage: chatLocale,
    });
    resetOnboarding();
    router.push('/session');
  };

  const renderInput = () => {
    if (status === 'done') {
      return (
        <div className="border-t border-black/5 p-4 text-center">
          <button
            type="button"
            onClick={beginSession}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {translations.onboarding.begin}
          </button>
        </div>
      );
    }
    if (input?.kind === 'choice') {
      return (
        <ChoiceChips
          options={input.options}
          onSelect={onSelect}
          onSkip={() => skip(chatMessages)}
        />
      );
    }
    return (
      <Composer
        disabled={false}
        placeholder={input?.placeholder}
        onSend={(text) => answer(chatMessages, text)}
      />
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <MessageList messages={messages} />
      {renderInput()}
    </main>
  );
}
