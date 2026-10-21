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
  private failure: Error | undefined;
  private wake: (() => void) | undefined;

  push(event: StreamEvent): void {
    this.queue.push(event);
    this.wake?.();
  }

  end(): void {
    this.ended = true;
    this.wake?.();
  }

  /** 연결이 끊긴 것처럼 남은 이벤트를 내준 뒤 오류를 던진다. */
  fail(error: Error): void {
    this.failure = error;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    while (true) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.failure) throw this.failure;
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

vi.mock('@/lib/data', async () => ({
  // 판정 함수는 진짜를 쓴다: 409 와 서버 거절을 가르는 것도 상태 전환의 일부다.
  ...(await vi.importActual<typeof import('@/lib/api/errors')>('@/lib/api/errors')),
  startSessionStream: () => nextStream(),
  sendMessageStream: vi.fn((_sessionId: string, _text: string, _turnId?: string) => nextStream()),
  streamTurn: vi.fn((_sessionId: string, _turnId: string) => nextStream()),
  retryTurnStream: vi.fn((_sessionId: string, _turnId: string) => nextStream()),
  cancelTurn: vi.fn(async (_sessionId: string, turnId: string) => ({
    turnId,
    status: 'cancelled' as const,
  })),
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

const data = await import('@/lib/data');
const { HttpError } = await import('@/lib/http');
const { useSessionStore } = await import('./session.store');
const { default: SessionPage } = await import('@/app/session/page');

let mounted: Mounted | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  streams.length = 0;
  vi.mocked(data.sendMessageStream).mockClear();
  vi.mocked(data.getMessages).mockClear();
  vi.mocked(data.streamTurn).mockClear();
  vi.mocked(data.retryTurnStream).mockClear();
  vi.mocked(data.cancelTurn).mockClear();
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

  /** Composer 는 인자 없는 measure 를 넘기므로 엔트리는 만들지 않는다. */
  constructor(private readonly callback: () => void) {}

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
    if (this.targets.length > 0) this.callback();
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

  it('대화 화면의 입력창 안(재는 높이 안)에 위기 띠의 두 번호가 전화 링크로 붙는다', async () => {
    await openGreeting();
    const form = document.querySelector('form');
    const hrefs = Array.from(form?.querySelectorAll('a[href^="tel:"]') ?? [], (a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['tel:109', 'tel:15771366']);
  });

  it('위기 턴 뒤의 멈춤 안내도 자기 높이를 입력창 높이로 알려, 위기 카드의 끝이 안내에 가리지 않게 한다', async () => {
    const STOPPED_HEIGHT = 152;
    const formRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this instanceof HTMLElement && this.hasAttribute('data-crisis-stopped')) {
        return { ...originalRect.call(this), height: STOPPED_HEIGHT } as DOMRect;
      }
      return formRect.call(this);
    };
    const { stream, pending } = await openGreeting();
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 3, done: true });
    stream.push({
      kind: 'done',
      result: { reply: '다시 와 주셔서 ', task: 1, progress: 0, supportLevel: 3, done: true },
    });
    stream.end();
    await flush();
    await act(async () => {
      await pending;
    });

    expect(document.querySelector('textarea')).toBeNull();
    expect(document.querySelector('[data-crisis-stopped]')).not.toBeNull();
    expect(composerVar()).toBe(`${STOPPED_HEIGHT}px`);
  });
});

describe('사용자 턴의 전송: 턴 id, 보내는 중, 끊김 뒤 한 번 다시 보내기, 409, 답 실패', () => {
  const USER_TEXT = '보리가 보고 싶어요';

  /** 첫 인사를 끝내 두고 사용자 말을 하나 보낸다. 그 턴의 첫 스트림과 끝나기를 기다리는 약속을 돌려준다. */
  async function sendOne(): Promise<{ stream: FakeStream; pending: Promise<void> }> {
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <SessionPage />
      </I18nProvider>,
    );
    let greeted!: Promise<void>;
    act(() => {
      greeted = useSessionStore
        .getState()
        .startSession({ griefPath: 'afterLoss', petName: '보리' });
    });
    await flush(0);
    const greeting = streams[0];
    if (!greeting) throw new Error('greeting stream not opened');
    greeting.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    greeting.push({ kind: 'token', text: '반가워요.' });
    greeting.push({
      kind: 'done',
      result: { reply: '반가워요.', task: 1, progress: 0, supportLevel: 1, done: false },
    });
    greeting.end();
    await flush();
    await act(async () => {
      await greeted;
    });

    let pending!: Promise<void>;
    act(() => {
      pending = useSessionStore.getState().sendUserMessage(USER_TEXT);
    });
    await flush(0);
    const stream = streams[1];
    if (!stream) throw new Error('turn stream not opened');
    return { stream, pending };
  }

  const userMessage = () =>
    useSessionStore.getState().messages.find((message) => message.role === 'user');
  const turnIds = (): (string | undefined)[] =>
    vi.mocked(data.sendMessageStream).mock.calls.map((call) => call[2]);

  it('턴 id 를 만들어 보내고, meta 전에는 보내는 중이었다가 meta 를 받으면 보통 모양이 된다', async () => {
    const { stream, pending } = await sendOne();

    expect(turnIds()).toHaveLength(1);
    expect(turnIds()[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(userMessage()).toMatchObject({ text: USER_TEXT, sending: true });
    expect(document.querySelector('[data-message-role="user"][data-sending]')).not.toBeNull();

    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    await flush();
    expect(userMessage()?.sending).toBeFalsy();
    expect(document.querySelector('[data-message-role="user"][data-sending]')).toBeNull();

    stream.push({ kind: 'token', text: '들려줘서 고마워요.' });
    stream.push({
      kind: 'done',
      result: { reply: '들려줘서 고마워요.', task: 1, progress: 0, supportLevel: 1, done: false },
    });
    stream.end();
    await flush();
    await act(async () => {
      await pending;
    });
    expect(botTexts().at(-1)).toBe('들려줘서 고마워요.');
  });

  it('meta 전에 끊기면 같은 턴 id 로 한 번 더 보내고, 그 답을 받는다', async () => {
    const { stream, pending } = await sendOne();
    stream.fail(new TypeError('Failed to fetch'));
    await flush();

    expect(turnIds()).toHaveLength(2);
    expect(turnIds()[1]).toBe(turnIds()[0]);
    expect(userMessage()).toMatchObject({ sending: true });
    expect(userMessage()?.failed).toBeFalsy();

    const retry = streams[2];
    if (!retry) throw new Error('retry stream not opened');
    retry.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    retry.push({ kind: 'token', text: '여기 있어요.' });
    retry.push({
      kind: 'done',
      result: { reply: '여기 있어요.', task: 1, progress: 0, supportLevel: 1, done: false },
    });
    retry.end();
    await flush();
    await act(async () => {
      await pending;
    });

    expect(userMessage()?.sending).toBeFalsy();
    expect(userMessage()?.failed).toBeFalsy();
    expect(botTexts().at(-1)).toBe('여기 있어요.');
    expect(useSessionStore.getState().streaming).toBe(false);
  });

  it('다시 보낸 것도 meta 전에 끊기면 더 보내지 않고 보내지 못함(failed)으로 둔다', async () => {
    const { stream, pending } = await sendOne();
    stream.fail(new TypeError('Failed to fetch'));
    await flush();
    streams[2]?.fail(new TypeError('Failed to fetch'));
    await flush();
    await act(async () => {
      await pending;
    });

    expect(turnIds()).toHaveLength(2);
    expect(userMessage()).toMatchObject({ failed: true });
    expect(userMessage()?.sending).toBeFalsy();
    // 빈 답 말풍선은 사라지고 첫 인사만 남는다.
    expect(botTexts()).toEqual(['반가워요.']);
    expect(document.body.textContent).toContain(ko.chat.sendFailed);
    expect(useSessionStore.getState().streaming).toBe(false);
  });

  it('서버가 오류 상태로 거절하면(연결 끊김이 아니면) 다시 보내지 않고 보내지 못함으로 둔다', async () => {
    const { stream, pending } = await sendOne();
    stream.fail(new HttpError(500, 'Request failed (500)'));
    await flush();
    await act(async () => {
      await pending;
    });

    expect(turnIds()).toHaveLength(1);
    expect(userMessage()).toMatchObject({ failed: true });
    expect(useSessionStore.getState().streaming).toBe(false);
  });

  it('409(이미 받은 턴)면 기록을 다시 읽어 화면을 그 기록에 맞춘다', async () => {
    const { stream, pending } = await sendOne();
    const at = '2026-10-21T01:00:00.000Z';
    vi.mocked(data.getMessages).mockResolvedValueOnce([
      { role: 'assistant', text: '반가워요.', task: 1, at },
      { role: 'user', text: USER_TEXT, task: 1, at, turnId: turnIds()[0] },
      { role: 'assistant', text: '먼저 받은 답이에요.', task: 1, at },
    ]);
    // 첫 전송은 서버에 닿았지만 확인 전에 끊겼고, 다시 보낸 것이 409 를 받는다.
    stream.fail(new TypeError('Failed to fetch'));
    await flush();
    streams[2]?.fail(new HttpError(409, 'Turn already received'));
    await flush();
    await act(async () => {
      await pending;
    });

    expect(data.getMessages).toHaveBeenCalledTimes(1);
    expect(turnIds()).toHaveLength(2);
    const messages = useSessionStore.getState().messages;
    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['bot', '반가워요.'],
      ['user', USER_TEXT],
      ['bot', '먼저 받은 답이에요.'],
    ]);
    expect(messages.some((message) => message.failed || message.sending)).toBe(false);
    expect(useSessionStore.getState().streaming).toBe(false);
  });

  it('meta 뒤에 끊기면 사용자 말은 남고 빈 답 말풍선은 사라지며 답을 받지 못했다는 문구가 보인다', async () => {
    const { stream, pending } = await sendOne();
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    await flush();
    stream.fail(new TypeError('network error'));
    await flush();
    await act(async () => {
      await pending;
    });

    expect(turnIds()).toHaveLength(1);
    expect(userMessage()).toMatchObject({ text: USER_TEXT });
    expect(userMessage()?.failed).toBeFalsy();
    expect(userMessage()?.sending).toBeFalsy();
    expect(botTexts()).toEqual(['반가워요.']);
    expect(document.body.textContent).toContain(ko.chat.replyFailed);
    expect(document.body.textContent).not.toContain(ko.chat.sendFailed);
    expect(useSessionStore.getState().streaming).toBe(false);
  });

  it('meta 뒤에 답 없이 스트림이 끝나도(답 실패) 같은 모양이 된다', async () => {
    const { stream, pending } = await sendOne();
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    stream.end();
    await flush();
    await act(async () => {
      await pending;
    });

    expect(userMessage()?.failed).toBeFalsy();
    expect(botTexts()).toEqual(['반가워요.']);
    expect(document.body.textContent).toContain(ko.chat.replyFailed);
    expect(useSessionStore.getState().streaming).toBe(false);
  });
});

describe('중단, 다시 붙기, 답 다시 받기', () => {
  const USER_TEXT = '보리가 보고 싶어요';
  const SESSION_ID = 'session-resume';
  const TURN_ID = 'turn-active';
  const AT = '2026-10-21T01:00:00.000Z';

  const stopButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${ko.chat.stop}"]`);
  const retryReplyButton = (): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === ko.chat.retryReply,
    );
  const userRows = () =>
    useSessionStore.getState().messages.filter((message) => message.role === 'user');

  function mountPage(): void {
    mounted = mount(
      <I18nProvider initialLocale="ko">
        <SessionPage />
      </I18nProvider>,
    );
  }

  /** 첫 인사를 끝내 두고 사용자 말을 하나 보낸다. */
  async function sendOne(): Promise<{ stream: FakeStream; pending: Promise<void> }> {
    mountPage();
    let greeted!: Promise<void>;
    act(() => {
      greeted = useSessionStore
        .getState()
        .startSession({ griefPath: 'afterLoss', petName: '보리' });
    });
    await flush(0);
    const greeting = streams[0];
    if (!greeting) throw new Error('greeting stream not opened');
    // 첫 인사는 사용자 말이 없어 중단할 수 없다.
    expect(stopButton()).toBeNull();
    greeting.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    greeting.push({ kind: 'token', text: '반가워요.' });
    greeting.push({
      kind: 'done',
      result: { reply: '반가워요.', task: 1, progress: 0, supportLevel: 1, done: false },
    });
    greeting.end();
    await flush();
    await act(async () => {
      await greeted;
    });

    let pending!: Promise<void>;
    act(() => {
      pending = useSessionStore.getState().sendUserMessage(USER_TEXT);
    });
    await flush(0);
    const stream = streams[1];
    if (!stream) throw new Error('turn stream not opened');
    return { stream, pending };
  }

  /** 서버의 상태와 기록을 정해 두고 세션을 다시 연다. */
  async function resumeWith(extra: object): Promise<void> {
    vi.mocked(data.getSessionState).mockResolvedValueOnce({
      sessionId: SESSION_ID,
      task: 1,
      progress: 0,
      supportLevel: 1,
      closed: false,
      reportAvailable: false,
      ...extra,
    });
    vi.mocked(data.getMessages).mockResolvedValueOnce([
      { role: 'assistant', text: '반가워요.', task: 1, at: AT },
      { role: 'user', text: USER_TEXT, task: 1, at: AT, turnId: TURN_ID },
    ]);
    mountPage();
    await act(async () => {
      await useSessionStore.getState().resumeSession(SESSION_ID, '보리');
    });
    await flush(0);
  }

  it('답이 흐르는 중에 중단하면 cancel 을 부르고, 두 말풍선이 빠지며 보낸 글이 입력창에 돌아온다', async () => {
    const { stream, pending } = await sendOne();
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    stream.push({ kind: 'token', text: '들려줘서 ' });
    await flush();

    const stop = stopButton();
    expect(stop).not.toBeNull();
    expect(stop?.disabled).toBe(false);
    const turnId = vi.mocked(data.sendMessageStream).mock.calls[0]?.[2];
    act(() => {
      stop?.click();
    });
    await flush(0);
    expect(data.cancelTurn).toHaveBeenCalledWith(useSessionStore.getState().sessionId, turnId);

    stream.push({ kind: 'cancelled' });
    stream.end();
    await flush();
    await act(async () => {
      await pending;
    });

    expect(userRows()).toHaveLength(0);
    expect(botTexts()).toEqual(['반가워요.']);
    expect(document.querySelector('textarea')?.value).toBe(USER_TEXT);
    expect(useSessionStore.getState().streaming).toBe(false);
    expect(stopButton()).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it('activeTurn 이 있는 세션을 다시 열면 사용자 말 아래 흐르는 답 말풍선을 두고 turn stream 에 붙는다', async () => {
    await resumeWith({ activeTurn: { turnId: TURN_ID, status: 'streaming' } });

    expect(data.streamTurn).toHaveBeenCalledWith(SESSION_ID, TURN_ID);
    const messages = useSessionStore.getState().messages;
    expect(messages.map((message) => message.role)).toEqual(['bot', 'user', 'bot']);
    expect(messages.at(-1)?.streaming).toBe(true);
    expect(useSessionStore.getState().streaming).toBe(true);

    const stream = streams[0];
    if (!stream) throw new Error('turn stream not opened');
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    stream.push({ kind: 'token', text: '여기까지 온 글 ' });
    stream.push({ kind: 'token', text: '이어지는 글.' });
    stream.push({
      kind: 'done',
      result: {
        reply: '여기까지 온 글 이어지는 글.',
        task: 1,
        progress: 0,
        supportLevel: 1,
        done: false,
      },
    });
    stream.end();
    await flush(1000);

    expect(botTexts()).toEqual(['반가워요.', '여기까지 온 글 이어지는 글.']);
    expect(useSessionStore.getState().streaming).toBe(false);
    expect(userRows()).toHaveLength(1);
  });

  it('failedTurn 이 있는 세션은 그 말 아래에 답 다시 받기를 두고, 누르면 retry 로 답만 다시 받는다', async () => {
    await resumeWith({ failedTurn: { turnId: TURN_ID } });

    expect(data.streamTurn).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(ko.chat.replyFailed);
    const retry = retryReplyButton();
    expect(retry).toBeDefined();

    act(() => {
      retry?.click();
    });
    await flush(0);
    expect(data.retryTurnStream).toHaveBeenCalledWith(SESSION_ID, TURN_ID);
    expect(data.sendMessageStream).not.toHaveBeenCalled();

    const stream = streams[0];
    if (!stream) throw new Error('retry stream not opened');
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    stream.push({ kind: 'token', text: '다시 받은 답이에요.' });
    stream.push({
      kind: 'done',
      result: { reply: '다시 받은 답이에요.', task: 1, progress: 0, supportLevel: 1, done: false },
    });
    stream.end();
    await flush();

    expect(userRows()).toHaveLength(1);
    expect(botTexts()).toEqual(['반가워요.', '다시 받은 답이에요.']);
    expect(retryReplyButton()).toBeUndefined();
    expect(document.body.textContent).not.toContain(ko.chat.replyFailed);
  });

  it('meta 뒤에 답이 실패하면 같은 자리에 답 다시 받기가 보이고, 누르면 같은 턴 id 로 retry 를 부른다', async () => {
    const { stream, pending } = await sendOne();
    stream.push({ kind: 'meta', task: 1, progress: 0, supportLevel: 1, done: false });
    await flush();
    stream.fail(new TypeError('network error'));
    await flush();
    await act(async () => {
      await pending;
    });

    const turnId = vi.mocked(data.sendMessageStream).mock.calls[0]?.[2];
    const retry = retryReplyButton();
    expect(retry).toBeDefined();
    act(() => {
      retry?.click();
    });
    await flush(0);

    expect(data.retryTurnStream).toHaveBeenCalledWith(useSessionStore.getState().sessionId, turnId);
    expect(data.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(userRows()).toHaveLength(1);
  });
});
