import { describe, expect, it } from 'vitest';
import { PUBLISH_STEPS } from '@/features/publish-prd';
import { PUBLISH_STEP_LABELS, publishStepLabel } from './steps';

describe('publish step labels', () => {
  it('labels every publish step and nothing else', () => {
    expect(Object.keys(PUBLISH_STEP_LABELS).sort()).toEqual([...PUBLISH_STEPS].sort());
    for (const step of PUBLISH_STEPS) expect(publishStepLabel(step).trim()).not.toBe('');
  });

  it('gives each step its own label', () => {
    const labels = PUBLISH_STEPS.map(publishStepLabel);
    expect(new Set(labels).size).toBe(PUBLISH_STEPS.length);
  });
});
