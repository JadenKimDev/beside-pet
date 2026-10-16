/**
 * features/session-archive/session-archive.types.ts — archive-feature types.
 * Load phases are modelled explicitly so pages render from one field instead
 * of inferring "loading" from an absent value.
 */

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The report adds a phase of its own: the session exists but carries no report yet. */
export type ReportStatus = LoadStatus | 'unavailable';
