import { describe, expect, it } from 'vitest';
import { safetyResources } from '../domain/safety-resources';
import { SafetyController } from './safety.controller';

describe('SafetyController', () => {
  it('serves the domain safety resources unchanged', () => {
    const controller = new SafetyController();
    expect(controller.resources()).toEqual(safetyResources());
  });
});
