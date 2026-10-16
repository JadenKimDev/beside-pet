import { describe, expect, it } from 'vitest';
import { matchesCrisis } from './crisis-pattern';

// 픽스처 문장은 모두 지어낸 것이다. 실제 사용자의 대화를 넣지 않는다.
// 키워드마다 그 키워드 하나로만 잡히는 문장을 둔다. 패턴에서 키워드 하나를 지우면 그 줄이 실패한다.
const SINGLE_KEYWORD_CASES: ReadonlyArray<[keyword: string, text: string]> = [
  ['kill myself', 'Some nights I think I should kill myself.'],
  ['killing myself', 'I keep thinking about killing myself since Bori left.'],
  ['end my life', 'I want to end my life tonight.'],
  ['want to die', 'Without him I just want to die.'],
  ['suicid (suicide)', 'I have been thinking about suicide.'],
  ['suicid (suicidal)', 'I feel suicidal since the funeral.'],
  ['self-harm', 'I started to self-harm again last week.'],
  ['self harm', 'I am worried I will self harm.'],
  ['selfharm', 'selfharm feels like the only way out.'],
];

describe('matchesCrisis', () => {
  it.each(SINGLE_KEYWORD_CASES)('catches "%s"', (_keyword, text) => {
    expect(matchesCrisis(text)).toBe(true);
  });

  it.each([
    'I WANT TO DIE',
    'Kill Myself',
    'End My Life',
    'SUICIDAL thoughts',
    'Self-Harm',
    'SELF HARM',
  ])('ignores letter case: "%s"', (text) => {
    expect(matchesCrisis(text)).toBe(true);
  });

  it.each([
    // 반려동물을 그리워하는 과장 표현
    'I could just die, I miss her so much.',
    'Losing Coco is killing me.',
    'This grief is going to kill me.',
    'I would die for one more walk with him.',
    'My life feels empty without my cat.',
    // 일반 슬픔 표현
    'I miss my dog every morning.',
    'I cried all day looking at his old toys.',
    'It hurts to come home to a quiet house.',
    // 빈 문자열
    '',
  ])('does not catch "%s"', (text) => {
    expect(matchesCrisis(text)).toBe(false);
  });
});
