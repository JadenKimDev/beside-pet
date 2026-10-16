import { describe, expect, it } from 'vitest';
import { crisisReply, safetyResources } from './safety-resources';

describe('safetyResources', () => {
  it('returns the two fixed helplines', () => {
    expect(safetyResources()).toEqual([
      {
        name: 'Suicide Prevention Hotline (Korea)',
        phone: '109',
        hours: '24h',
        note: 'Talk to a trained counselor right away.',
      },
      {
        name: 'Danuri Helpline (multilingual)',
        phone: '1577-1366',
        hours: '24h',
        note: 'Support in several languages for residents in Korea.',
      },
    ]);
  });

  it('returns the same content on every call', () => {
    expect(safetyResources()).toEqual(safetyResources());
  });
});

describe('crisisReply', () => {
  it('is the fixed wording that carries every helpline number', () => {
    const reply = crisisReply();
    expect(reply).toBe(
      "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach a counselor right now at 109 (24h), or the multilingual Danuri Helpline at 1577-1366.",
    );
    for (const resource of safetyResources()) {
      expect(reply).toContain(resource.phone);
    }
  });

  it('returns the same wording on every call', () => {
    expect(crisisReply()).toBe(crisisReply());
  });
});
