'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/auth.store';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { useOnboardingStore } from '@/features/onboarding/onboarding.store';
import { useSessionStore } from '@/features/session/session.store';
import type { GriefProfile } from '@/lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const setChatLanguage = useAuthStore((state) => state.setChatLanguage);
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const startSession = useSessionStore((state) => state.startSession);

  const beginSession = (profile: GriefProfile) => {
    // Kick off the session (sets status synchronously) and navigate immediately
    // so the greeting streams on the session screen rather than off-screen here.
    void startSession(profile);
    resetOnboarding();
    router.push('/session');
  };

  return (
    <OnboardingFlow
      onChooseLanguage={(chosen) => void setChatLanguage(chosen)}
      onBegin={beginSession}
    />
  );
}
