'use client';

/**
 * Root — the public landing and sign-in gate.
 * Checks the session (/me) once on entry, then routes by role:
 *   admin  → /admin (account management)
 *   viewer → /sessions (list; redirects first-timers to /onboarding)
 * Signed-out visitors see the hero and the auth card. While the check runs the
 * hero is already drawn and only the card shows a skeleton (no empty first paint).
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/auth.store';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { LandingHero } from '@/features/landing/components/LandingHero';
import { LandingIntro } from '@/features/landing/components/LandingIntro';

const HOME_FOR_ROLE: Record<string, string> = {
  admin: '/admin',
  viewer: '/sessions',
};

export default function HomePage() {
  const router = useRouter();
  const principal = useAuthStore((s) => s.principal);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // Once signed in, route by role.
  useEffect(() => {
    if (principal) {
      router.replace(HOME_FOR_ROLE[principal.role] ?? '/onboarding');
    }
  }, [principal, router]);

  return (
    <main className="flex-1 overflow-x-clip">
      <LandingHero card={<AuthCard />} />
      <LandingIntro />
    </main>
  );
}
