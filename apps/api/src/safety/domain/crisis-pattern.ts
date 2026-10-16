/**
 * crisis-pattern.ts — single source of truth for the deterministic crisis keyword screen.
 * Being rule-based (not LLM) keeps regression runs reproducible, and keeping the pattern in
 * one place stops the domain fast-path (SafetyCheckService) and the model-failure fallback
 * (ReplyComposerAdapter) from drifting apart. English keywords only — other languages are
 * covered by the model-based screen (LlmPort.assessRisk, language-agnostic).
 * Detection only — the crisis reply itself stays fixed (see safety-resources.ts).
 */

/**
 * Self-harm / suicidal-intent signals. Grief hyperbole about missing the pet is not the target;
 * these are non-idiomatic phrasings. Case-insensitive.
 */
const CRISIS_PATTERN = /kill myself|killing myself|end my life|want to die|suicid|self[-\s]?harm/i;

/** Whether one user message trips the deterministic crisis screen. */
export const matchesCrisis = (text: string): boolean => CRISIS_PATTERN.test(text);
