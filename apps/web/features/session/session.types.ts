/**
 * features/session/session.types.ts — session-feature domain types.
 * The chat Message type is shared (onboarding + session), so it lives in
 * components/chat, not here.
 */

/** idle: nothing held · active: talking · closed: wrapped up (or paused by the safety hand-off). */
export type SessionStatus = 'idle' | 'active' | 'closed';
