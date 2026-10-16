/**
 * lib/stream/typewriter.ts — smooths a token stream into a steady render rate.
 * Incoming chunks (which may arrive bursty or jagged from the network/model) are
 * buffered, then drained a few characters per tick so the UI types at a calm,
 * even pace. When the backlog grows it catches up faster, so it never lags far
 * behind. This decouples render speed from arrival speed (GPT-style typing).
 */

/** Render tick — roughly one animation frame. */
const TICK_MS = 16;
/** Minimum characters revealed per tick (sets the baseline typing speed). */
const MIN_CHARS_PER_TICK = 1;
/** Larger backlogs drain proportionally faster: chars/tick ≈ backlog / this. */
const CATCHUP_DIVISOR = 8;

export interface TypewriterHandlers {
  /** Called with the full visible text whenever it grows. */
  onText: (visible: string) => void;
  /** Called once the buffer is fully drained after finish(). */
  onComplete: () => void;
}

export interface Typewriter {
  /** Queue more text to be revealed. */
  push: (chunk: string) => void;
  /** Signal the stream ended; onComplete fires once the buffer drains. */
  finish: () => void;
  /** Stop immediately without firing onComplete (e.g. on reset/error). */
  cancel: () => void;
}

export function createTypewriter(handlers: TypewriterHandlers): Typewriter {
  let pending = '';
  let visible = '';
  let finished = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const tick = (): void => {
    if (pending.length > 0) {
      const take = Math.max(MIN_CHARS_PER_TICK, Math.ceil(pending.length / CATCHUP_DIVISOR));
      visible += pending.slice(0, take);
      pending = pending.slice(take);
      handlers.onText(visible);
    }
    if (pending.length === 0 && finished) {
      stop();
      handlers.onComplete();
    }
  };

  const ensureRunning = (): void => {
    if (timer === undefined) {
      timer = setInterval(tick, TICK_MS);
    }
  };

  return {
    push(chunk) {
      pending += chunk;
      ensureRunning();
    },
    finish() {
      finished = true;
      ensureRunning(); // drain any remainder even if no push happened
    },
    cancel() {
      stop();
      pending = '';
    },
  };
}
