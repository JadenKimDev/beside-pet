import { describe, expect, it } from 'vitest';
import { particle, withParticle } from './particle';

describe('particle', () => {
  // [word, 와/과, 는/은, 를/을, 가/이, 로/으로]
  const table: [string, string, string, string, string, string][] = [
    ['보리', '와', '는', '를', '가', '로'],
    ['콩이', '와', '는', '를', '가', '로'],
    ['별', '과', '은', '을', '이', '로'],
    ['솜', '과', '은', '을', '이', '으로'],
    ['초코', '와', '는', '를', '가', '로'],
    ['밤톨', '과', '은', '을', '이', '로'],
    ['해피', '와', '는', '를', '가', '로'],
    ['한국어', '와', '는', '를', '가', '로'],
    ['Max', '와', '는', '를', '가', '로'],
    ['English', '와', '는', '를', '가', '로'],
    ['R2D2', '와', '는', '를', '가', '로'],
    ['7', '와', '는', '를', '가', '로'],
  ];

  it.each(table)('%s → %s %s %s %s %s', (word, wa, neun, reul, ga, ro) => {
    expect(particle(word, '와/과')).toBe(wa);
    expect(particle(word, '는/은')).toBe(neun);
    expect(particle(word, '를/을')).toBe(reul);
    expect(particle(word, '가/이')).toBe(ga);
    expect(particle(word, '로/으로')).toBe(ro);
  });

  it('ignores trailing spaces when looking at the last letter', () => {
    expect(particle('별 ', '와/과')).toBe('과');
  });

  it('treats an empty word as having no final consonant', () => {
    expect(particle('', '는/은')).toBe('는');
  });

  it('withParticle joins the word and its particle', () => {
    expect(withParticle('별', '와/과')).toBe('별과');
    expect(withParticle('보리', '는/은')).toBe('보리는');
  });
});
