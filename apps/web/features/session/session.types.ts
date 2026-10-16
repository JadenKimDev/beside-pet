/**
 * features/session/session.types.ts — session-feature domain types.
 * The chat Message type is shared (onboarding + session), so it lives in
 * components/chat, not here.
 */

export type SessionStatus = 'idle' | 'active' | 'closed';
