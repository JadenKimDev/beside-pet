// 위기 번호는 웹 i18n 과 서버의 고정값(`GET /v1/safety/resources`, apps/server/src/safety/resources.rs)이 같아야 한다.
// 웹에는 그 응답의 타입이 없으므로 서버 소스에서 phone 값을 읽고, 알려진 값으로도 한 번 더 묶는다.
// 서버의 고정 위기 문구(자원의 name·note, CRISIS_REPLY)도 사용자에게 그대로 보이므로 웹과 같은 금지어 규칙(ADR-0003)을 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bannedWordsIn } from '@/i18n/banned-words';
import { en } from '@/i18n/en';
import { ko } from '@/i18n/ko';

const SERVER_SOURCE = fileURLToPath(
  new URL('../../../server/src/safety/resources.rs', import.meta.url),
);
/** 서버 resources.rs 의 RESOURCES 순서 그대로. */
const SERVER_PHONES = ['109', '1577-1366'];

function serverPhones(): string[] {
  const source = readFileSync(SERVER_SOURCE, 'utf8');
  return Array.from(source.matchAll(/phone:\s*"([^"]+)"/g), (match) => match[1]);
}

/** 서버 소스에서 사용자에게 보이는 고정 문구: 자원의 name·note 와 CRISIS_REPLY. */
function serverUserFacingCopy(): string[] {
  const source = readFileSync(SERVER_SOURCE, 'utf8');
  return Array.from(
    source.matchAll(/(?:\b(?:name|note):|CRISIS_REPLY: &str =)\s*"((?:[^"\\]|\\.)*)"/g),
    (match) => match[1],
  );
}

const CATALOGS = { ko, en };

describe('위기 번호', () => {
  it('서버 소스의 번호가 알려진 고정값과 같다', () => {
    expect(serverPhones()).toEqual(SERVER_PHONES);
  });

  it('서버의 고정 위기 문구(자원 name·note, CRISIS_REPLY)에 ADR-0003 금지어가 없다', () => {
    const copy = serverUserFacingCopy();
    expect(copy.length).toBe(SERVER_PHONES.length * 2 + 1);
    const hits = copy.flatMap((text) =>
      bannedWordsIn(text).map((pattern) => `${pattern} in "${text}"`),
    );
    expect(hits).toEqual([]);
  });

  for (const [locale, messages] of Object.entries(CATALOGS)) {
    it(`${locale} 의 safety.lines 번호가 서버와 같은 순서, 같은 값이다`, () => {
      expect(messages.safety.lines.map((line) => line.number)).toEqual(serverPhones());
    });

    it(`${locale} 의 바닥 위기 띠 글에 두 번호가 그대로 들어 있다(전화 링크로 바꾼다)`, () => {
      for (const phone of SERVER_PHONES) expect(messages.footer.crisis).toContain(phone);
    });

    it(`${locale} 의 긴급 줄에 112 와 119 가 있다`, () => {
      expect(messages.safety.emergency).toMatch(/\b112\b/);
      expect(messages.safety.emergency).toMatch(/\b119\b/);
    });
  }
});
