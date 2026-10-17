// 대화 스트림(`POST /v1/sessions/{id}/messages/stream`)의 Server-Sent Events 를 읽는 순수 함수.
//
// 서버(`apps/server/src/support/sse.rs`)는 이벤트마다 `data: <JSON>\n\n` 한 프레임을 보내고, 차례는
// `meta` → `token`* → `done` 이다. 흐르던 중에 실패하면 `done` 없이 끊으므로, `done` 이 없으면 실패로 본다.
// 받은 조각은 프레임 경계와 맞지 않으므로 `splitFrames` 가 남은 글을 돌려주고 다음 조각에 잇는다.

/** 한 턴의 결과. 서버 `TurnResponse` 와 같은 칸이다. */
export type TurnResponse = { reply: string; task: number; progress: number; supportLevel: number; done: boolean };

/** 스트림 이벤트 하나. 서버 `StreamEvent`(`kind` 로 가른다)와 같다. */
export type StreamEvent =
  | { kind: "meta"; task: number; progress: number; supportLevel: number; done: boolean }
  | { kind: "token"; text: string }
  | { kind: "done"; result: TurnResponse };

/** 쌓인 글을 빈 줄로 끝난 프레임들과 아직 끝나지 않은 나머지로 나눈다. `\r\n` 도 받는다. */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.replace(/\r\n?/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((part) => part.trim() !== ""), rest };
}

/** 프레임의 `data:` 줄들을 이어 붙인다(여러 줄이면 `\n` 으로). 주석(`:`)과 `event:` 같은 다른 칸은 버린다. */
export function frameData(frame: string): string | null {
  const lines = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return lines.length === 0 ? null : lines.join("\n");
}

type EventFields = { kind?: string; text?: string; result?: TurnResponse } & Partial<Omit<TurnResponse, "reply">>;

function isTurnResponse(value: TurnResponse | undefined): value is TurnResponse {
  return (
    value !== undefined &&
    typeof value.reply === "string" &&
    typeof value.task === "number" &&
    typeof value.progress === "number" &&
    typeof value.supportLevel === "number" &&
    typeof value.done === "boolean"
  );
}

/** 프레임 하나를 이벤트로 읽는다. 데이터가 없으면 null, 모르는 모양이면 어느 칸이 틀렸는지 말하며 던진다. */
export function parseFrame(frame: string): StreamEvent | null {
  const data = frameData(frame);
  if (data === null) return null;
  let fields: EventFields;
  try {
    fields = JSON.parse(data) as EventFields;
  } catch {
    throw new Error(`SSE 프레임이 JSON 이 아닙니다: ${data.slice(0, 80)}`);
  }
  if (fields.kind === "token" && typeof fields.text === "string") return { kind: "token", text: fields.text };
  if (fields.kind === "done" && isTurnResponse(fields.result)) return { kind: "done", result: fields.result };
  if (fields.kind === "meta") {
    const { task, progress, supportLevel, done } = fields;
    if (
      typeof task === "number" &&
      typeof progress === "number" &&
      typeof supportLevel === "number" &&
      typeof done === "boolean"
    ) {
      return { kind: "meta", task, progress, supportLevel, done };
    }
  }
  throw new Error(`SSE 이벤트의 모양을 모릅니다(kind: ${String(fields.kind)})`);
}

/** 조각을 차례로 받아 이벤트를 내는 읽개. `push` 는 그 조각으로 끝난 프레임의 이벤트, `end` 는 남은 글의 이벤트다. */
export function createSseReader(): { push: (chunk: string) => StreamEvent[]; end: () => StreamEvent[] } {
  let buffer = "";
  const events = (frames: string[]) => frames.map(parseFrame).filter((event): event is StreamEvent => event !== null);
  return {
    push(chunk) {
      const { frames, rest } = splitFrames(buffer + chunk);
      buffer = rest;
      return events(frames);
    },
    end() {
      const rest = buffer;
      buffer = "";
      return rest.trim() === "" ? [] : events([rest]);
    },
  };
}

/** 이벤트들을 모은 턴. `done` 이 없으면(도중에 끊긴 스트림) 던진다. 토큰을 이은 글과 `done` 의 답이 다르면 `done` 을 따른다. */
export function collectTurn(events: StreamEvent[]): { result: TurnResponse; tokens: number; text: string } {
  let text = "";
  let tokens = 0;
  let result: TurnResponse | null = null;
  for (const event of events) {
    if (event.kind === "token") {
      text += event.text;
      tokens += 1;
    } else if (event.kind === "done") {
      result = event.result;
    }
  }
  if (result === null) throw new Error(`스트림이 done 없이 끝났습니다(토큰 ${tokens}개를 받은 뒤)`);
  return { result, tokens, text };
}
