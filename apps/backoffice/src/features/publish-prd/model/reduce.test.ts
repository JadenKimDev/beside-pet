import { describe, expect, it } from 'vitest';
import {
  applyPublishEvent,
  beginPublish,
  endPublish,
  INITIAL_PUBLISH_PRD,
  type PublishPrdData,
  rejectPublish,
} from './reduce';
import { PUBLISH_PRD_TEXT } from './texts';

const URL_901 = 'https://github.com/example/repo/issues/901';

function running(): PublishPrdData {
  return beginPublish(INITIAL_PUBLISH_PRD);
}

describe('publish-prd reduce', () => {
  it('starts with the five steps pending in order', () => {
    expect(INITIAL_PUBLISH_PRD.steps).toEqual(
      ['push', 'ledger', 'commit', 'git-push', 'worktree'].map((step) => ({
        step,
        status: 'pending',
        output: '',
      })),
    );
    expect(INITIAL_PUBLISH_PRD).toMatchObject({ status: 'idle', issue: null, url: null });
  });

  it('beginPublish goes running and clears an earlier error', () => {
    const data = beginPublish({ ...INITIAL_PUBLISH_PRD, status: 'error', error: '앞의 오류' });
    expect(data).toMatchObject({ status: 'running', error: null });
  });

  it('updates a step and takes the issue and url when push is ok', () => {
    let data = applyPublishEvent(running(), { step: 'push', status: 'running', output: '' });
    expect(data.steps[0]).toEqual({ step: 'push', status: 'running', output: '' });
    data = applyPublishEvent(data, {
      step: 'push',
      status: 'ok',
      output: 'created #901',
      issue: 901,
      url: URL_901,
    });
    expect(data.steps[0]).toEqual({ step: 'push', status: 'ok', output: 'created #901' });
    expect(data).toMatchObject({ status: 'running', issue: 901, url: URL_901 });
  });

  it('goes done when the last step is ok', () => {
    let data = running();
    for (const step of ['push', 'ledger', 'commit', 'git-push', 'worktree'] as const) {
      data = applyPublishEvent(data, { step, status: 'ok', output: `${step} ok` });
    }
    expect(data.status).toBe('done');
    expect(data.steps.every((s) => s.status === 'ok')).toBe(true);
  });

  it('stops at a failed step and leaves the later steps pending', () => {
    let data = applyPublishEvent(running(), { step: 'push', status: 'ok', output: '' });
    data = applyPublishEvent(data, { step: 'ledger', status: 'failed', output: 'ledger 실패' });
    expect(data.status).toBe('failed');
    expect(data.steps.map((s) => s.status)).toEqual([
      'ok',
      'failed',
      'pending',
      'pending',
      'pending',
    ]);
    expect(data.steps[1].output).toBe('ledger 실패');
  });

  it('endPublish turns a stream cut while running into an error', () => {
    const data = applyPublishEvent(running(), { step: 'push', status: 'running', output: '' });
    expect(endPublish(data)).toMatchObject({
      status: 'error',
      error: PUBLISH_PRD_TEXT.interrupted,
    });
    const failed = applyPublishEvent(running(), { step: 'push', status: 'failed', output: '' });
    expect(endPublish(failed)).toBe(failed);
  });

  it('rejectPublish keeps the steps and shows why it did not start', () => {
    expect(rejectPublish(running(), '본 체크아웃이 main 이 아니에요')).toMatchObject({
      status: 'error',
      error: '본 체크아웃이 main 이 아니에요',
    });
  });
});
