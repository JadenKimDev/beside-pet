import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES } from './config';
import { contrastRatio, deltaE76 } from './contrast';
import { readThemeTokens } from './tokens';

const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');

/** The 22 contrast pairs of design proposal §3.4: [foreground, background, minimum]. */
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ['fg', 'bg', 4.5],
  ['fg', 'surface', 4.5],
  ['fg-muted', 'bg', 4.5],
  ['fg-muted', 'surface', 4.5],
  ['fg-muted', 'bg-sunk', 4.5],
  ['fg-muted', 'surface-raised', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent-fg', 'accent-hover', 4.5],
  ['accent-ink', 'bg', 4.5],
  ['accent-ink', 'surface', 4.5],
  ['accent-ink', 'accent-soft', 4.5],
  ['fg', 'accent-soft', 4.5],
  ['accent', 'bg', 3],
  ['crisis-fg', 'crisis-bg', 4.5],
  ['crisis-fg', 'surface', 4.5],
  ['crisis-ink', 'crisis-bg', 4.5],
  ['danger', 'bg', 4.5],
  ['danger-fg', 'danger', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['border-strong', 'surface', 3],
  ['border-strong', 'bg', 3],
  ['bg', 'fg', 4.5],
];

const COLOR_TOKENS = [
  'bg',
  'bg-sunk',
  'surface',
  'surface-raised',
  'fg',
  'fg-muted',
  'border',
  'border-strong',
  'accent',
  'accent-fg',
  'accent-hover',
  'accent-ink',
  'accent-soft',
  'warm',
  'dusk',
  'danger',
  'danger-fg',
  'danger-soft',
  'crisis-bg',
  'crisis-border',
  'crisis-fg',
  'crisis-ink',
];

const MODES = ['light', 'dark'] as const;

describe('contrast helpers', () => {
  it('match the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(deltaE76('#D8B66E', '#DABE73')).toBeCloseTo(3.7, 1);
  });
});

describe.each(THEMES)('theme %s', (theme) => {
  describe.each(MODES)('%s', (mode) => {
    const tokens = readThemeTokens(css, theme)[mode];

    it('defines all 22 colour tokens', () => {
      expect(Object.keys(tokens).sort()).toEqual(expect.arrayContaining([...COLOR_TOKENS].sort()));
    });

    it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
      expect(contrastRatio(tokens[fg] ?? '', tokens[bg] ?? '')).toBeGreaterThanOrEqual(min);
    });

    it('keeps the accent apart from the crisis card line (ΔE ≥ 30)', () => {
      expect(deltaE76(tokens.accent ?? '', tokens['crisis-border'] ?? '')).toBeGreaterThanOrEqual(
        30,
      );
    });
  });
});
