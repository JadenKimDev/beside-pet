/**
 * Data checks on the ko/en catalogs: banned wording (ADR-0003) and placeholder
 * parity between locales. These catch the class of bugs the 2026-10 review found
 * (a wrong hotline number, "counselor" in en, a broken en sentence).
 */
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ko } from './ko';
import { walkCatalog } from './walk';

const catalogs = { ko, en } as const;

/** ADR-0003: words never used in user-facing copy. */
const BANNED_EN = [
  /\bcounsel(?:ing|ling|or|lor|ors|lors)?\b/i,
  /\btherap(?:y|ies|ist|ists|eutic)\b/i,
  /\btreatments?\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bdiagnos(?:e|es|is|ed|ing)\b/i,
  /\bcure[sd]?\b/i,
  /\bpatients?\b/i,
];
const BANNED_KO = [/상담/, /치료/];
const BANNED = [...BANNED_EN, ...BANNED_KO];

/** The proper name of an outside institution, not a description of this product. */
const PROPER_NAMES = ['자살예방상담전화'];

/**
 * ADR-0003's only exception: disclaimers stating the negative ("not a substitute for …").
 * Each listed entry must actually contain the negative form.
 */
const DISCLAIMERS: Record<string, RegExp> = {
  'footer.disclaimer': /대신하지 않아요|not a substitute/,
};

const stripProperNames = (text: string): string =>
  PROPER_NAMES.reduce((acc, name) => acc.split(name).join(''), text);

describe.each(Object.entries(catalogs))('%s catalog wording', (_locale, catalog) => {
  const entries = walkCatalog(catalog);

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it('uses no ADR-0003 banned word outside the disclaimers', () => {
    const hits = entries
      .filter((entry) => !(entry.path in DISCLAIMERS))
      .flatMap((entry) =>
        BANNED.filter((pattern) => pattern.test(stripProperNames(entry.text))).map(
          (pattern) => `${entry.path}: ${pattern} in "${entry.text}"`,
        ),
      );
    expect(hits).toEqual([]);
  });

  it('keeps each disclaimer in its negative form', () => {
    for (const [path, negative] of Object.entries(DISCLAIMERS)) {
      const entry = entries.find((candidate) => candidate.path === path);
      expect(entry, path).toBeDefined();
      expect(entry?.text).toMatch(negative);
    }
  });

  it('has no emoji', () => {
    const hits = entries.filter((entry) => /\p{Extended_Pictographic}/u.test(entry.text));
    expect(hits.map((entry) => entry.path)).toEqual([]);
  });
});

describe('ko and en agree', () => {
  const koEntries = walkCatalog(ko);
  const enEntries = walkCatalog(en);
  const enByPath = new Map(enEntries.map((entry) => [entry.path, entry]));

  it('have the same entry paths', () => {
    expect(koEntries.map((entry) => entry.path).sort()).toEqual(
      enEntries.map((entry) => entry.path).sort(),
    );
  });

  it('use every argument of a function entry in both locales', () => {
    const problems = koEntries.flatMap((koEntry) => {
      const enEntry = enByPath.get(koEntry.path);
      if (!enEntry || koEntry.arity === 0) return [];
      const expected = Array.from({ length: koEntry.arity }, (_, index) => index);
      const out: string[] = [];
      if (enEntry.arity !== koEntry.arity)
        out.push(`${koEntry.path}: arity ko ${koEntry.arity} en ${enEntry.arity}`);
      for (const [locale, entry] of [
        ['ko', koEntry],
        ['en', enEntry],
      ] as const) {
        const used = new Set(entry.placeholders);
        for (const index of expected) {
          if (!used.has(`⟦${index}⟧`))
            out.push(`${koEntry.path} (${locale}): argument ${index} unused`);
        }
      }
      return out;
    });
    expect(problems).toEqual([]);
  });

  it('give the same helpline numbers', () => {
    expect(ko.safety.lines.map((line) => line.number)).toEqual(['109', '1577-1366']);
    expect(en.safety.lines.map((line) => line.number)).toEqual(
      ko.safety.lines.map((line) => line.number),
    );
  });

  it('mention the emergency numbers 112 and 119 on the help page and crisis card', () => {
    for (const catalog of [ko, en]) {
      expect(catalog.safety.emergency).toMatch(/112/);
      expect(catalog.safety.emergency).toMatch(/119/);
    }
  });

  it('never carry the old mental-health line 1577-0199', () => {
    for (const entry of [...koEntries, ...enEntries]) {
      expect(entry.text, entry.path).not.toMatch(/1577-0199/);
    }
  });
});
