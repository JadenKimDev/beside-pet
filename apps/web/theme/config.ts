/**
 * theme/config.ts — colour theme configuration.
 * The theme is a device setting kept only in a cookie (never on the server or
 * in the DB). The layout reads it on the server so the first paint already has
 * the right `<html data-theme>` (no flash). Light/dark follows the OS.
 * Adding a theme = a `THEMES` entry here and a `html[data-theme="<key>"]` block
 * in `app/globals.css` (the contrast test checks the new block).
 */

export const THEMES = ['hanji', 'night', 'ink'] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'hanji';

/** Cookie that stores the chosen theme. Same shape as the locale cookie. */
export const THEME_COOKIE = 'beside-pet.theme';

export const isTheme = (value: string): value is Theme =>
  (THEMES as readonly string[]).includes(value);

/** Normalize an arbitrary cookie value to a known theme (unknown or missing → default). */
export const resolveTheme = (value: string | undefined): Theme =>
  value && isTheme(value) ? value : DEFAULT_THEME;
