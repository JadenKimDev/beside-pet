/**
 * features/session-archive/session-archive.types.ts — archive-feature types.
 * Load phases are modelled explicitly so pages render from one field instead
 * of inferring "loading" from an absent value.
 */

/** `unauthorized`: the backend refused the session (signed out, revoked account) — not a retryable failure. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'unauthorized';

/** The report adds a phase of its own: the session exists but carries no report yet. */
export type ReportStatus = LoadStatus | 'unavailable';
