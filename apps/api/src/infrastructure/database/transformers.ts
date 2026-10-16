/**
 * transformers.ts — column value transformers for the persistence boundary.
 * This is where DB nullability is translated to the domain's `undefined` rule:
 * timestamptz columns round-trip as ISO-8601 strings, and nullable columns map
 * SQL NULL to `undefined` (and back) so domain code never sees `null`.
 */
import type { ValueTransformer } from 'typeorm';

/** timestamptz ⇄ ISO-8601 string; SQL NULL ⇄ undefined. */
export const isoInstant: ValueTransformer = {
  to: (value: string | undefined): string | null => value ?? null,
  from: (value: Date | null): string | undefined =>
    value === null ? undefined : value.toISOString(),
};

/** jsonb (or any column) ⇄ value; SQL NULL ⇄ undefined. */
export const nullable = <T>(): ValueTransformer => ({
  to: (value: T | undefined): T | null => value ?? null,
  from: (value: T | null): T | undefined => value ?? undefined,
});
