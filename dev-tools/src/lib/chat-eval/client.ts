// 대화 실측 도구의 HTTP 클라이언트. 제품 서버(`apps/server`)의 공개 경로만 부른다.
//
// - 계정은 `data/qa/account.json` 의 viewer 뿐이다. 비밀번호는 로그인 요청 본문에만 싣고, 오류 문구와 반환값과
//   로그 어디에도 싣지 않는다. 오류 문구에 요청 본문을 되풀이하지 않는다.
// - 로그인 응답의 `Set-Cookie`(`beside-pet.token`)를 받아 두고 이후 요청에 `Cookie` 로 붙인다.
// - 응답 칸 이름은 서버의 `support/response.rs` 와 같다(camelCase). 서버를 바꾸면 여기도 맞춘다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GriefProfile } from "./persona.ts";
import { collectTurn, createSseReader, type StreamEvent, type TurnResponse } from "./sse.ts";

export type { TurnResponse } from "./sse.ts";

export const DEFAULT_API = "http://127.0.0.1:3000";
export const QA_ACCOUNT_FILE = "data/qa/account.json";
/** 서버가 없을 때 알리는 띄우는 명령(레포 루트에서). */
export const SERVER_START_COMMAND =
  "cd apps/server && APP_ENV=sandbox ../../dev-tools/scripts/cargo.sh run -p beside-pet-server";
const AUTH_COOKIE = "beside-pet.token";
/** 모델 답을 기다리는 요청의 상한. 로컬 Ollama 는 한 턴에 수십 초가 걸린다. */
const MODEL_TIMEOUT_MS = 300_000;
const QUICK_TIMEOUT_MS = 10_000;

export type ChatLanguage = "ko" | "en";

export type SessionStateResponse = {
  sessionId: string;
  task: number;
  progress: number;
  supportLevel: number;
  closed: boolean;
  reportAvailable: boolean;
};

export type MessageResponse = { role: "assistant" | "user"; text: string; task: number; at: string };

export type SupportPlanResponse = {
  createdAt: string;
  pathFocus: string;
  taskFocuses: { task: number; emphasis: string; tone: string }[];
  cautions: string[];
};

/**
 * 턴 추적(#37). 서버가 `APP_ENV=sandbox` 에서만 채우고 production 과 옛 서버의 응답에는 칸이 없다.
 * 칸 이름은 서버의 `TurnStyle::decisions()` 와 `reply.rs` 의 블록 이름을 따른다. 모두 없을 수 있다고 보고 읽는다.
 */
export type TurnTrace = {
  promptVersion?: string;
  blocks?: { name: string; chars: number }[];
  turnStyle?: {
    questionPolicy?: "forbid" | "allow" | "invite";
    reassureCooldown?: boolean;
    endingAvoid?: string;
    stockPassed?: string[];
    judgeLine?: boolean;
    shortRule?: boolean;
    actionRule?: ("feelingGuess" | "meaningGiven" | "permission")[];
  };
  systemPrompt?: string;
};

export type TurnAnalysisResponse = {
  at: string;
  task: number;
  phase: "intro" | "resume" | "task" | "deepen" | "retry" | "closing";
  risk: { level: number; detectedBy: "keyword" | "none" };
  transition: { from: number; to: number; advanced: boolean; retryCount: number };
  knowledge: { source: string; tags: string[] }[];
  supervision?: { evaluated: boolean; quality: "ok" | "review"; flags: string[]; note?: string };
  /** sandbox 에서만 있다. */
  trace?: TurnTrace | null;
};

export type SessionSummaryResponse = {
  at: string;
  reachedTask: number;
  turnCount: number;
  highestSupportLevel: number;
  headline: string;
  followUp: string;
};

export type SessionAnalysisResponse = {
  sessionId: string;
  closed: boolean;
  plan?: SupportPlanResponse;
  analyses: TurnAnalysisResponse[];
  summary?: SessionSummaryResponse;
  history: MessageResponse[];
};

export type MindReportResponse = {
  at: string;
  startedAt: string;
  petName: string;
  reachedTask: number;
  progress: number;
  locale: ChatLanguage;
  sections: { key: "journey" | "emotions" | "keepsake" | "encouragement"; body: string; tags?: string[] }[];
};

/** `GET /v1/sessions` 의 항목. 여기서 쓰는 칸만 적는다. */
export type SessionListItem = { sessionId: string; startedAt: string; closed: boolean };

/** 스트림으로 받은 턴. `firstTokenMs` 는 요청을 보낸 때부터 첫 `token` 이벤트까지(토큰이 없으면 null). */
export type StreamedTurn = { result: TurnResponse; firstTokenMs: number | null; tokens: number };

export type QaAccount = { username: string; password: string };

/** 서버가 2xx 가 아닌 상태를 돌려줬다. `message` 에는 경로, 상태, 서버의 오류 문구만 싣는다(요청 본문은 싣지 않는다). */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, serverMessage: string) {
    super(`${path} → ${status}${serverMessage === "" ? "" : `: ${serverMessage}`}`);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

/** 레포 루트의 QA 계정 파일에서 viewer 를 읽는다. 오류 문구에 파일 내용을 싣지 않는다. */
export function loadQaAccount(root: string): QaAccount {
  const file = join(root, QA_ACCOUNT_FILE);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`QA 계정 파일이 없습니다: ${file}`);
  }
  const data = JSON.parse(text) as { viewer?: { username?: string; password?: string } };
  const viewer = data.viewer;
  if (
    typeof viewer?.username !== "string" ||
    viewer.username === "" ||
    typeof viewer.password !== "string" ||
    viewer.password === ""
  ) {
    throw new Error(`${file}: viewer.username 과 viewer.password 가 있어야 합니다`);
  }
  return { username: viewer.username, password: viewer.password };
}

/** `CHAT_EVAL_API` 가 있으면 그것, 없으면 기본 주소. 끝의 `/` 는 뗀다. */
export function apiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.CHAT_EVAL_API?.trim();
  return (value === undefined || value === "" ? DEFAULT_API : value).replace(/\/+$/, "");
}

/** `Set-Cookie` 값들에서 인증 쿠키의 `이름=값` 을 고른다. 없으면 null. */
export function authCookieFrom(setCookies: string[]): string | null {
  for (const header of setCookies) {
    const pair = header.split(";")[0]?.trim() ?? "";
    if (pair.startsWith(`${AUTH_COOKIE}=`) && pair.length > AUTH_COOKIE.length + 1) return pair;
  }
  return null;
}

/** 오류 응답 본문(`{ statusCode, message, error }`)에서 서버의 문구만 꺼낸다. 모양이 다르면 빈 글. */
async function serverMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
  } catch {
    // 본문이 JSON 이 아니면 문구 없이 상태만 알린다.
  }
  return "";
}

export type ChatClient = ReturnType<typeof createClient>;

export function createClient(options: { baseUrl?: string; account: QaAccount }) {
  const baseUrl = (options.baseUrl ?? apiBaseUrl()).replace(/\/+$/, "");
  let cookie: string | null = null;

  function headers(json: boolean): Record<string, string> {
    const result: Record<string, string> = {};
    if (json) result["content-type"] = "application/json";
    if (cookie !== null) result.cookie = cookie;
    return result;
  }

  /** 요청을 보내고 2xx 가 아니면 `ApiError` 를 던진다. `quiet` 이면 서버 문구도 싣지 않는다(로그인). */
  async function request(
    method: string,
    path: string,
    init: { body?: object; timeoutMs?: number; quiet?: boolean } = {},
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? QUICK_TIMEOUT_MS),
    });
    if (!response.ok)
      throw new ApiError(response.status, `${method} ${path}`, init.quiet ? "" : await serverMessage(response));
    return response;
  }

  async function getJson<T>(path: string, timeoutMs?: number): Promise<T> {
    const response = await request("GET", path, { timeoutMs });
    return (await response.json()) as T;
  }

  async function postJson<T>(path: string, body?: object): Promise<T> {
    const response = await request("POST", path, { body, timeoutMs: MODEL_TIMEOUT_MS });
    return (await response.json()) as T;
  }

  /** 스트림 경로에 보내고 이벤트를 모은다. `onToken` 은 토큰이 올 때마다 그 글을 받는다. */
  async function stream(path: string, body: object, onToken?: (text: string) => void): Promise<StreamedTurn> {
    const sentAt = performance.now();
    const response = await request("POST", path, { body, timeoutMs: MODEL_TIMEOUT_MS });
    if (response.body === null) throw new Error(`POST ${path}: 스트림 본문이 없습니다`);
    const reader = createSseReader();
    const decoder = new TextDecoder();
    const events: StreamEvent[] = [];
    let firstTokenMs: number | null = null;
    const take = (batch: StreamEvent[]) => {
      for (const event of batch) {
        if (event.kind === "token") {
          firstTokenMs ??= Math.round(performance.now() - sentAt);
          onToken?.(event.text);
        }
        events.push(event);
      }
    };
    for await (const chunk of response.body) take(reader.push(decoder.decode(chunk, { stream: true })));
    take(reader.push(decoder.decode()));
    take(reader.end());
    const { result, tokens } = collectTurn(events);
    return { result, firstTokenMs, tokens };
  }

  const sessionPath = (id: string) => `/v1/sessions/${encodeURIComponent(id)}`;
  const startBody = (sessionId: string, profile: GriefProfile | null) => ({ sessionId, griefProfile: profile });

  return {
    baseUrl,

    /** `GET /v1/health`. 서버에 닿지 않으면 띄우는 명령을 담아 던진다. */
    async health(): Promise<void> {
      try {
        await request("GET", "/v1/health");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `서버(${baseUrl})의 health 가 실패했습니다: ${reason}\n레포 루트에서 서버를 띄운 뒤 다시 돌리세요:\n  ${SERVER_START_COMMAND}`,
        );
      }
    },

    /** QA viewer 로 로그인해 인증 쿠키를 받아 둔다. 실패 문구에는 상태와 사용자 이름만 싣는다. */
    async login(): Promise<void> {
      const { username, password } = options.account;
      let response: Response;
      try {
        response = await request("POST", "/v1/auth/login", { body: { username, password }, quiet: true });
      } catch (error) {
        const status = error instanceof ApiError ? String(error.status) : "연결 실패";
        throw new Error(`QA 계정(${username}) 로그인에 실패했습니다(${status})`);
      }
      cookie = authCookieFrom(response.headers.getSetCookie());
      if (cookie === null) throw new Error(`QA 계정(${username}) 로그인 응답에 ${AUTH_COOKIE} 쿠키가 없습니다`);
    },

    /** `POST /v1/sessions`: 세션을 열고 첫 인사를 받는다. 프로필이 null 이면 기록에서 이어 간다. */
    start: (sessionId: string, profile: GriefProfile | null) =>
      postJson<TurnResponse>("/v1/sessions", startBody(sessionId, profile)),
    /** `POST /v1/sessions/stream`. */
    startStream: (sessionId: string, profile: GriefProfile | null, onToken?: (text: string) => void) =>
      stream("/v1/sessions/stream", startBody(sessionId, profile), onToken),
    /** `POST /v1/sessions/{id}/messages`. 닫힌 세션이면 409 `ApiError`. */
    send: (id: string, text: string) => postJson<TurnResponse>(`${sessionPath(id)}/messages`, { text }),
    /** `POST /v1/sessions/{id}/messages/stream`. */
    sendStream: (id: string, text: string, onToken?: (text: string) => void) =>
      stream(`${sessionPath(id)}/messages/stream`, { text }, onToken),
    state: (id: string) => getJson<SessionStateResponse>(sessionPath(id)),
    messages: (id: string) => getJson<MessageResponse[]>(`${sessionPath(id)}/messages`),
    analysis: (id: string) => getJson<SessionAnalysisResponse>(`${sessionPath(id)}/analysis`, MODEL_TIMEOUT_MS),
    /** `GET /v1/sessions/{id}/report`. 열 수 없는 세션(404, 409)이면 null. */
    async report(id: string): Promise<MindReportResponse | null> {
      try {
        return await getJson<MindReportResponse>(`${sessionPath(id)}/report`, MODEL_TIMEOUT_MS);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return null;
        throw error;
      }
    },
    /** `GET /v1/sessions`: 로그인한 계정 본인의 세션 목록(서버가 개수를 자른다). */
    list: () => getJson<SessionListItem[]>("/v1/sessions"),
    /** `DELETE /v1/sessions/{id}`: 본인 소유의 세션 하나를 지운다(ADR-0006). */
    async remove(id: string): Promise<void> {
      await request("DELETE", sessionPath(id));
    },
    /** `POST /v1/sessions/{id}/close`. 이미 닫혔으면 그대로의 상태를 돌려준다. */
    close: (id: string) => postJson<SessionStateResponse>(`${sessionPath(id)}/close`),
  };
}
