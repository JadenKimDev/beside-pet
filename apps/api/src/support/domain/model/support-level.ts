/**
 * support-level.ts — safety level value object. Level 3 = crisis, hand-off to support resources / helpline.
 * Matches the contract with the frontend TurnResult.supportLevel.
 */
export type SupportLevel = 1 | 2 | 3;

export const SUPPORT_SAFE: SupportLevel = 1;
export const SUPPORT_WATCH: SupportLevel = 2;
export const SUPPORT_CRISIS: SupportLevel = 3;

export const isCrisis = (level: SupportLevel): boolean => level >= SUPPORT_CRISIS;
