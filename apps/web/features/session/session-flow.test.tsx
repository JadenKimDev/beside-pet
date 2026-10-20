// @vitest-environment jsdom
// 대화 화면의 상태 전환: 가짜 스트림으로 토큰이 이어 붙고, 흐르는 동안 보내기가 잠기며 `done` 뒤 풀린다.
// 단계가 오르면 구분선이 생기고, 위기 수준(supportLevel 3)의 답 아래에는 위기 카드가 붙고 컴포저 자리가 멈춤 안내로 바뀐다.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Mounted, mount } from '@/components/ui/test-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ko } from '@/i18n/ko';
import type { StreamEvent } from '@/lib/api';

/** 손으로 흘려 보내는 스트림. push 한 이벤트를 차례로 내주고 end() 로 끝난다. */
class FakeStream implements AsyncIterable<StreamEvent> {
  private queue: StreamEvent[] = [];
  private ended = false;
  private wake: (() => void) | undefined;

  push(event: StreamEvent): void {
    this.queue.push(event);
    this.wake?.();
  }

  end(): void {
    this.ended = true;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    while (true) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
}

const streams: FakeStream[] = [];
const nextStream = (): FakeStream => {
  const stream = new FakeStream();
  streams.push(stream);
  return stream;
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/session',
  useParams: () => ({}),
}));

vi.mock('@/lib/data', () => ({
  startSessionStream: () => nextStream(),
  sendMessageStream: () => nextStream(),
  getSessionState: vi.fn(async (sessionId: string) => ({
    sessionId,
    task: 1,
    progress: 0,
    supportLevel: 1,
    closed: false,
    reportAvailable: false,
  })),
  getMessages: vi.fn(async () => []),
  closeSession: vi.fn(),
  listSessions: vi.fn(async () => []),
}));

const { useSessionStore } = await import('./session.store');
const { default: SessionPage } = await import('@/app/session/page');

let mounted: Mounted | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  streams.length = 0;
});

afterEach(() => {
  act(() => useSessionStore.getState().reset());
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** 이벤트 루프와 타자기(16ms 틱)를 충분히 돌린다. */
async function flush(ms = 400): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function sendButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[type="submit"][aria-label="${ko.chat.send}"]`,
  );
  if (!button) throw new Error('send button not found');
  return button;
}

function type(text: string): void {
  const field = document.querySelector('textarea');
  if (!field) throw new Error('composer field not found');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const botTexts = (): string[] =>
  Array.from(
    document.querySelectorAll('[data-message-role="bot"] [data-message-text]'),
    (node) => node.textContent ?? '',
  );

describe('대화 화면의 상태 전환', () => {
  it('토큰이 이어 붙고 보내기가 잠겼다가 done 뒤 풀리며, 단계가 오르면 구분선, 위기 턴에는 위기 카드가 붙는다', async () => {
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <SessionPage />
      </I18nProvider>,
    );

    // 첫 인사: 첫 토큰 전에는 점 세 개(기다림).
    let pending!: Promise<void>;
    act(() => {
      pending = useSessionStore
        .getState()
        .startSession({ griefPath: 'afterLoss', petName: '보리' });
    });
    await flush(0);
    expect(
      document.querySelector(`[role="status"][aria-label="${ko.chat.typing}"]`),
    ).not.toBeNull();

    const greeting = streams[0];
    if (!greeting) throw new Error('greeting stream not opened');
    greeting.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    greeting.push({ kind: 'token', text: '다시 와 주셔서 ' });
    await flush();
    greeting.push({ kind: 'token', text: '반가워요.' });
    await flush();

    // 흐르는 중: 글이 이어 붙고, 입력이 있어도 보내기는 잠기며, 목록은 아직 알리지 않는다(aria-busy).
    type('보리 이야기를 하고 싶어요');
    expect(botTexts()).toEqual(['다시 와 주셔서 반가워요.']);
    expect(sendButton().disabled).toBe(true);
    expect(document.querySelector('textarea')?.disabled).toBe(false);
    const log = document.querySelector('[aria-live="polite"]');
    expect(log?.getAttribute('aria-busy')).toBe('true');

    greeting.push({
      kind: 'done',
      result: {
        reply: '다시 와 주셔서 반가워요.',
        task: 1,
        progress: 0,
        supportLevel: 1,
        done: false,
      },
    });
    greeting.end();
    await flush();
    await act(async () => {
      await pending;
    });

    // done 뒤: 보내기가 풀리고 목록이 완성된 답을 알린다.
    expect(sendButton().disabled).toBe(false);
    expect(log?.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelectorAll('[data-stage-divider]')).toHaveLength(0);

    // 두 번째 턴: 단계가 2 로 오르면 그 답 앞에 구분선이 생긴다.
    act(() => {
      sendButton().click();
    });
    await flush(0);
    const second = streams[1];
    if (!second) throw new Error('second stream not opened');
    expect(sendButton().disabled).toBe(true);
    second.push({ kind: 'meta', task: 2, progress: 0.25, supportLevel: 1, done: false });
    second.push({ kind: 'token', text: '그 마음을 들려줘서 고마워요.' });
    second.push({
      kind: 'done',
      result: {
        reply: '그 마음을 들려줘서 고마워요.',
        task: 2,
        progress: 0.25,
        supportLevel: 1,
        done: false,
      },
    });
    second.end();
    await flush();

    const dividers = Array.from(document.querySelectorAll('[data-stage-divider]'));
    expect(dividers.map((node) => node.textContent)).toEqual([ko.chat.stage(2, ko.taskLabels[2])]);
    type('너무 힘들어요');
    expect(sendButton().disabled).toBe(false);

    // 세 번째 턴: 위기 수준의 고정 답 아래에 위기 카드가 붙고, 컴포저 자리는 멈춤 안내와 두 버튼이 된다.
    act(() => {
      sendButton().click();
    });
    await flush(0);
    const third = streams[2];
    if (!third) throw new Error('third stream not opened');
    third.push({ kind: 'meta', task: 2, progress: 0.25, supportLevel: 3, done: true });
    third.push({ kind: 'token', text: 'Fixed safety reply.' });
    third.push({
      kind: 'done',
      result: {
        reply: 'Fixed safety reply.',
        task: 2,
        progress: 0.25,
        supportLevel: 3,
        done: true,
      },
    });
    third.end();
    await flush();

    const crisisTitle = Array.from(document.querySelectorAll('[role="region"] h3')).find(
      (node) => node.textContent === ko.crisis.title,
    );
    expect(crisisTitle).toBeDefined();
    const lastBot = Array.from(document.querySelectorAll('[data-message-role="bot"]')).at(-1);
    expect(lastBot?.nextElementSibling?.querySelector('[role="region"]')).not.toBeNull();
    expect(document.body.textContent).toContain(ko.crisis.stopped);
    expect(document.querySelector('textarea')).toBeNull();
    const actions = Array.from(document.querySelectorAll('a'), (a) => a.textContent);
    expect(actions).toContain(ko.crisis.toList);
    expect(actions).toContain(ko.crisis.toHelp);
  });
});

/** 지어낸 입력창 높이. 실제 값은 글에 따라 자라므로 테스트에서만 숫자로 둔다. */
const COMPOSER_HEIGHT = 126;

/** jsdom 에 없는 ResizeObserver 의 가짜. observe 하면 곧바로 한 번 알리고, resizeAll() 로 다시 알린다. */
class FakeResizeObserver {
  static live = new Set<FakeResizeObserver>();
  private targets: Element[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.targets.push(target);
    FakeResizeObserver.live.add(this);
    this.notify();
  }

  unobserve(target: Element): void {
    this.targets = this.targets.filter((item) => item !== target);
  }

  disconnect(): void {
    this.targets = [];
    FakeResizeObserver.live.delete(this);
  }

  notify(): void {
    const entries = this.targets.map((target) => ({ target }) as unknown as ResizeObserverEntry);
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

const endMarker = (): HTMLElement => {
  const end = document.querySelector<HTMLElement>('[data-message-end]');
  if (!end) throw new Error('end marker not found');
  return end;
};

const composerVar = (): string =>
  document.querySelector('main')?.style.getPropertyValue('--composer-height') ?? '';

const newReplyPill = (): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === ko.chat.newReply,
  );

describe('대화 화면의 스크롤과 입력창 높이', () => {
  /** 끝 표시의 bottom 을 정한다. 기본은 입력창 위 경계에 맞춘 자리. */
  let endBottom = 0;
  const scrollIntoView = vi.fn();
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    endBottom = window.innerHeight - COMPOSER_HEIGHT;
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this instanceof HTMLFormElement) {
        return { ...originalRect.call(this), height: COMPOSER_HEIGHT } as DOMRect;
      }
      if (this instanceof HTMLElement && this.hasAttribute('data-message-end')) {
        return { ...originalRect.call(this), top: endBottom, bottom: endBottom } as DOMRect;
      }
      return originalRect.call(this);
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.live.clear();
    Element.prototype.getBoundingClientRect = originalRect;
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  async function openGreeting(): Promise<{ stream: FakeStream; pending: Promise<void> }> {
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <SessionPage />
      </I18nProvider>,
    );
    let pending!: Promise<void>;
    act(() => {
      pending = useSessionStore
        .getState()
        .startSession({ griefPath: 'afterLoss', petName: '보리' });
    });
    await flush(0);
    const stream = streams[0];
    if (!stream) throw new Error('greeting stream not opened');
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    stream.push({ kind: 'token', text: '다시 와 주셔서 ' });
    await flush();
    return { stream, pending };
  }

  it('답이 자랄 때 끝 표시로 스크롤하고, 끝 표시는 입력창 높이만큼 위에서 멈춘다', async () => {
    await openGreeting();
    expect(composerVar()).toBe(`${COMPOSER_HEIGHT}px`);
    expect(endMarker().style.scrollMarginBottom).toBe('var(--composer-height, 0px)');

    scrollIntoView.mockClear();
    streams[0]?.push({ kind: 'token', text: '반가워요.' });
    await flush();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(newReplyPill()).toBeUndefined();
  });

  it('끝 표시가 입력창 높이만큼 가려진 상태(입력창 위 경계에서 220px 안)는 새 답을 따라 내려간다', async () => {
    const { stream } = await openGreeting();

    endBottom = window.innerHeight;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    scrollIntoView.mockClear();
    stream.push({ kind: 'token', text: '반가워요.' });
    await flush();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(newReplyPill()).toBeUndefined();
  });

  it('끝 표시가 입력창 위 경계보다 220px 넘게 아래면 따라가지 않고 새 답 알약을 띄운다', async () => {
    const { stream } = await openGreeting();

    // 뷰포트 바닥에서는 220px 안이지만, 입력창 위 경계에서는 220px 넘게 아래다.
    endBottom = window.innerHeight + 150;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    scrollIntoView.mockClear();
    stream.push({ kind: 'token', text: '반가워요.' });
    await flush();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(newReplyPill()).toBeDefined();
  });

  it('입력창이 없는 화면(마침)에서는 입력창 높이가 0 이다', async () => {
    const { stream, pending } = await openGreeting();
    expect(composerVar()).toBe(`${COMPOSER_HEIGHT}px`);

    stream.push({
      kind: 'done',
      result: { reply: '다시 와 주셔서 ', task: 4, progress: 1, supportLevel: 1, done: true },
    });
    stream.end();
    await flush();
    await act(async () => {
      await pending;
    });

    expect(document.querySelector('textarea')).toBeNull();
    expect(composerVar()).toBe('0px');
  });
});
