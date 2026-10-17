// 인물 하나의 대화를 끝까지 돌리는 실행기. 대본 모드는 인물 파일의 턴을 차례로 보내고, 대화 모드는
// `nextTurn` 이 주는 발화를 보낸다(`/close` 나 null 이면 끝). 턴마다 벽시계 지연과(스트림이면) 첫 토큰 지연을 재고
// 자동 검사를 붙인다. 세션이 닫히면(응답의 done 또는 409) 더 보내지 않고 상태·전사·분석·리포트를 받는다.
// 표준 입력을 읽는 일은 부르는 쪽(cli)이 정하고, 여기서는 줄을 읽는 도우미 `stdinLines` 만 둔다.

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

import { checkSession, checkTurn, type Flag } from "./checks.ts";
import {
  ApiError,
  type ChatClient,
  type MessageResponse,
  type MindReportResponse,
  type SessionAnalysisResponse,
  type SessionStateResponse,
  type TurnResponse,
} from "./client.ts";
import { type Persona, petNamesOf } from "./persona.ts";

/** 사용자 턴 하나의 기록. `index` 는 1 부터(첫 인사는 턴이 아니다), 지연은 밀리초다. */
export type TurnRecord = {
  index: number;
  user: string;
  answer: string;
  task: number | null;
  progress: number;
  supportLevel: number;
  done: boolean;
  latencyMs: number;
  firstTokenMs: number | null;
  flags: Flag[];
};

/**
 * 세션이 어떻게 닫혔나. crisis: 서버가 위기(supportLevel 3 이상)로 닫음, flow: 서버가 위기가 아닌 이유(클로징)로
 * 닫음, user: 대화 모드에서 `/close` 나 입력 끝, script: 대본을 다 보내고 도구가 닫음, none: 닫지 못함.
 */
export type ClosedBy = "crisis" | "flow" | "user" | "script" | "none";

export type RunResult = {
  persona: Persona;
  sessionId: string;
  startedAt: string;
  greeting: string;
  greetingLatencyMs: number;
  turns: TurnRecord[];
  closed: boolean;
  closedBy: ClosedBy;
  sessionFlags: Flag[];
  state: SessionStateResponse;
  messages: MessageResponse[];
  analysis: SessionAnalysisResponse;
  /** 열 수 없는 세션(과제 2 전 등, 404·409)이면 null. */
  report: MindReportResponse | null;
};

export type RunOptions = {
  client: ChatClient;
  mode: "script" | "interactive";
  stream: boolean;
  onTurn: (turn: TurnRecord) => void;
  /** 대화 모드의 다음 발화. `/close` 나 null 이면 끝낸다. */
  nextTurn?: () => Promise<string | null>;
  /** 첫 인사를 받았을 때. */
  onGreeting?: (greeting: string, latencyMs: number) => void;
  /** 스트림의 토큰이 올 때마다(실시간으로 보여 줄 때). */
  onToken?: (text: string) => void;
};

/** 대화 모드에서 끝을 뜻하는 발화. */
export const CLOSE_COMMAND = "/close";

type Timed = { result: TurnResponse; latencyMs: number; firstTokenMs: number | null };

/** 서버 위기 판정과 같은 경계: 지원 단계 3 이상이면 위기다. */
const CRISIS_LEVEL = 3;

async function timed(
  stream: boolean,
  plain: () => Promise<TurnResponse>,
  streamed: () => Promise<{ result: TurnResponse; firstTokenMs: number | null }>,
): Promise<Timed> {
  const at = performance.now();
  if (stream) {
    const { result, firstTokenMs } = await streamed();
    return { result, firstTokenMs, latencyMs: Math.round(performance.now() - at) };
  }
  const result = await plain();
  return { result, firstTokenMs: null, latencyMs: Math.round(performance.now() - at) };
}

/** 대본 모드는 다음 대본 턴, 대화 모드는 `nextTurn` 의 발화. 빈 줄은 건너뛴다. 끝이면 null. */
function utterances(persona: Persona, options: RunOptions): () => Promise<string | null> {
  if (options.mode === "script") {
    let next = 0;
    return async () => persona.turns[next++] ?? null;
  }
  const nextTurn = options.nextTurn;
  if (nextTurn === undefined) throw new Error("대화 모드에는 nextTurn 이 있어야 합니다");
  return async () => {
    for (;;) {
      const line = await nextTurn();
      if (line === null) return null;
      const text = line.trim();
      if (text === CLOSE_COMMAND) return null;
      if (text !== "") return text;
    }
  };
}

/** 인물 하나를 돌린다. 세션 id 는 인물 이름과 무작위 꼬리로 새로 만든다. */
export async function runPersona(persona: Persona, options: RunOptions): Promise<RunResult> {
  const { client, stream } = options;
  const language = persona.language;
  const petNames = petNamesOf(persona);
  const sessionId = `chat-eval-${persona.name}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const next = utterances(persona, options);

  const opening = await timed(
    stream,
    () => client.start(sessionId, persona.profile),
    () => client.startStream(sessionId, persona.profile, options.onToken),
  );
  options.onGreeting?.(opening.result.reply, opening.latencyMs);

  const turns: TurnRecord[] = [];
  let closedBy: ClosedBy = opening.result.done ? closedByServer(opening.result) : "none";
  while (closedBy === "none") {
    const user = await next();
    if (user === null) {
      closedBy = options.mode === "script" ? "script" : "user";
      await client.close(sessionId);
      break;
    }
    let turn: Timed;
    try {
      turn = await timed(
        stream,
        () => client.send(sessionId, user),
        () => client.sendStream(sessionId, user, options.onToken),
      );
    } catch (error) {
      // 409: 우리가 모르는 사이에 서버가 닫았다. 더 보내지 않는다.
      if (error instanceof ApiError && error.status === 409) {
        closedBy = "flow";
        break;
      }
      throw error;
    }
    const { result } = turn;
    const record: TurnRecord = {
      index: turns.length + 1,
      user,
      answer: result.reply,
      task: result.task,
      progress: result.progress,
      supportLevel: result.supportLevel,
      done: result.done,
      latencyMs: turn.latencyMs,
      firstTokenMs: turn.firstTokenMs,
      flags: checkTurn({ answer: result.reply, language, petNames }),
    };
    turns.push(record);
    options.onTurn(record);
    if (result.done) closedBy = closedByServer(result);
  }

  const state = await client.state(sessionId);
  const [messages, analysis, report] = await Promise.all([
    client.messages(sessionId),
    client.analysis(sessionId),
    client.report(sessionId),
  ]);
  return {
    persona,
    sessionId,
    startedAt,
    greeting: opening.result.reply,
    greetingLatencyMs: opening.latencyMs,
    turns,
    closed: state.closed,
    closedBy,
    sessionFlags: checkSession({ language, turns, expect: persona.expect }),
    state,
    messages,
    analysis,
    report,
  };
}

function closedByServer(result: TurnResponse): ClosedBy {
  return result.supportLevel >= CRISIS_LEVEL ? "crisis" : "flow";
}

/**
 * 표준 입력을 한 줄씩 읽는 도우미. `next` 는 다음 줄, 입력이 끝나면 null. 다 쓰면 `close` 로 놓는다.
 * `prompt` 가 있으면 줄을 기다리기 전에 표준 출력에 쓴다.
 */
export function stdinLines(prompt = ""): { next: () => Promise<string | null>; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async next() {
      if (prompt !== "") process.stdout.write(prompt);
      const { value, done } = await lines.next();
      return done ? null : value;
    },
    close: () => rl.close(),
  };
}
