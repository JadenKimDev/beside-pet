// 장기기억 실측이 sandbox DB 에서 세션 하나의 시각을 과거로 미는 일. 시각 칸만 UPDATE 하고 본문 칸은 읽지도 쓰지도 않는다.
//
// - 연결은 환경의 `DATABASE_URL`, 없으면 `apps/server/.env.sandbox` 의 그 줄이다. 주소가 127.0.0.1:5433(sandbox)이 아니면
//   거부한다. 주소와 비밀번호는 오류 문구와 출력에 싣지 않는다.
// - 대상 칸은 `apps/server/migrations/*.sql` 에서 정했다: sessions.created_at·updated_at, messages.at, turns.started_at·
//   finished_at, turn_analyses.at, 그 세션 id 의 llm_calls.at. sessions.report(jsonb, 리포트 본문) 안의 시각은 건드리지 않는다.
// - 서버의 저장(`support/store.rs` 의 save)은 세션을 다시 쓸 때 messages.at·turn_analyses.at 을 메모리의 값으로 덮는다.
//   그래서 그 세션의 API 호출(상태, 전사, 분석, 리포트)을 모두 마친 뒤에 민다. 재개는 DB 에서 `created_at DESC` 로 고른다.
// - 장기기억(#38)은 건수만 센다: 소유자의 `current_memory` 행 수와 종류별 수, `memory_optouts` 행 수. 본문 칸
//   (`memory_notes.text`, `pets.name`)은 어떤 쿼리도 SELECT 하지 않는다. 테이블이 없으면(마이그레이션 전) null 이다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const SANDBOX_HOSTS = ["127.0.0.1", "localhost"];
const SANDBOX_PORT = "5433";
const ENV_FILE = join("apps", "server", ".env.sandbox");

/** 연결 주소가 sandbox(루프백의 5433)인가. 주소를 해석할 수 없으면 false. */
export function isSandboxUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
  return SANDBOX_HOSTS.includes(parsed.hostname) && parsed.port === SANDBOX_PORT;
}

/** dotenv 글에서 `DATABASE_URL` 의 값. 없으면 null. 따옴표는 뗀다. */
export function databaseUrlFromEnvText(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const value = (match[1] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value !== "") return value;
  }
  return null;
}

/** sandbox 의 연결 주소. 없거나 sandbox 가 아니면 던진다(주소는 싣지 않는다). */
export function sandboxDatabaseUrl(root: string, env: NodeJS.ProcessEnv = process.env): string {
  let url = env.DATABASE_URL?.trim() || null;
  let source = "환경 변수 DATABASE_URL";
  if (url === null) {
    source = ENV_FILE;
    try {
      url = databaseUrlFromEnvText(readFileSync(join(root, ENV_FILE), "utf8"));
    } catch {
      throw new Error(`DATABASE_URL 이 환경에도 ${ENV_FILE} 에도 없습니다`);
    }
    if (url === null) throw new Error(`${ENV_FILE} 에 DATABASE_URL 이 없습니다`);
  }
  if (!isSandboxUrl(url)) {
    throw new Error(`${source} 가 sandbox(127.0.0.1:${SANDBOX_PORT})가 아니라 날짜 밀기를 거부합니다`);
  }
  return url;
}

/** 세션 하나를 민 결과: 테이블마다 바뀐 행 수. */
export type ShiftCounts = {
  sessions: number;
  messages: number;
  turns: number;
  turnAnalyses: number;
  llmCalls: number;
};

/** `$1` 은 세션 id, `$2` 는 밀 날 수(음수면 과거로). 시각 칸만 고친다. */
const SHIFT_STATEMENTS: [keyof ShiftCounts, string][] = [
  [
    "sessions",
    `UPDATE sessions SET created_at = created_at + make_interval(days => $2),
                         updated_at = updated_at + make_interval(days => $2) WHERE id = $1`,
  ],
  ["messages", "UPDATE messages SET at = at + make_interval(days => $2) WHERE session_id = $1"],
  [
    "turns",
    `UPDATE turns SET started_at = started_at + make_interval(days => $2),
                      finished_at = finished_at + make_interval(days => $2) WHERE session_id = $1`,
  ],
  ["turnAnalyses", "UPDATE turn_analyses SET at = at + make_interval(days => $2) WHERE session_id = $1"],
  ["llmCalls", "UPDATE llm_calls SET at = at + make_interval(days => $2) WHERE session_id = $1"],
];

/** 소유자의 장기기억 건수. 본문은 없다. `byKind` 는 종류 이름 → 행 수(없는 종류는 빠진다). */
export type MemoryCounts = { total: number; byKind: Record<string, number>; optouts: number };

/** 건수 쿼리. `$1` 은 세션 id 이고 소유자는 그 세션의 owner_id 다. count 와 kind 만 고른다. */
const MEMORY_TABLES_SQL = `SELECT to_regclass('current_memory') IS NOT NULL AND to_regclass('memory_optouts') IS NOT NULL AS ok`;
const MEMORY_KIND_SQL = `SELECT kind, count(*) AS n FROM current_memory
  WHERE owner_id = (SELECT owner_id FROM sessions WHERE id = $1) GROUP BY kind`;
const MEMORY_OPTOUT_SQL = `SELECT count(*) AS n FROM memory_optouts
  WHERE owner_id = (SELECT owner_id FROM sessions WHERE id = $1)`;
const EXTRACT_CALLS_SQL = `SELECT count(*) AS n FROM llm_calls WHERE session_id = $1 AND purpose = 'memory_extract'`;

/** 기억 건수와 추출 대기에 쓰는 쿼리 전부. 본문 칸을 고르지 않는지 테스트가 본다. */
export const MEMORY_COUNT_QUERIES: readonly string[] = [
  MEMORY_TABLES_SQL,
  MEMORY_KIND_SQL,
  MEMORY_OPTOUT_SQL,
  EXTRACT_CALLS_SQL,
];

export type SandboxDb = {
  /** 세션 하나의 시각을 `days` 일 민다. 세션 행이 없으면(서버가 다른 DB 를 본다) 되돌리고 던진다. */
  shiftSession(sessionId: string, days: number): Promise<ShiftCounts>;
  /** 세션들의 시작 시각과 행 수(본문 없음). 확인용. */
  sessionTimes(
    sessionIds: string[],
  ): Promise<{ id: string; createdAt: string; messages: number; lastMessageAt: string | null }[]>;
  /** 세션 소유자의 장기기억 건수. 기억 테이블이 없으면 null. */
  memoryCounts(sessionId: string): Promise<MemoryCounts | null>;
  /** 그 세션의 기억 추출 호출(`llm_calls.purpose = 'memory_extract'`) 수. 추출이 끝나기를 기다리는 데 쓴다. */
  extractCalls(sessionId: string): Promise<number>;
  close(): Promise<void>;
};

export async function openSandboxDb(root: string): Promise<SandboxDb> {
  const client = new pg.Client({ connectionString: sandboxDatabaseUrl(root) });
  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "연결 실패";
    throw new Error(`sandbox DB 에 닿지 않습니다(${code}). pnpm db:up 으로 띄우세요`);
  }
  return {
    async shiftSession(sessionId, days) {
      const counts: ShiftCounts = { sessions: 0, messages: 0, turns: 0, turnAnalyses: 0, llmCalls: 0 };
      await client.query("BEGIN");
      try {
        for (const [key, sql] of SHIFT_STATEMENTS) {
          counts[key] = (await client.query(sql, [sessionId, days])).rowCount ?? 0;
        }
        if (counts.sessions !== 1) {
          throw new Error(`sandbox DB 에 세션 ${sessionId} 이 없습니다. 서버가 sandbox DB 를 보는지 확인하세요`);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return counts;
    },
    async sessionTimes(sessionIds) {
      const result = await client.query<{
        id: string;
        created_at: Date;
        messages: string;
        last_message_at: Date | null;
      }>(
        `SELECT s.id, s.created_at, count(m.seq) AS messages, max(m.at) AS last_message_at
           FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
          WHERE s.id = ANY($1) GROUP BY s.id, s.created_at ORDER BY s.created_at`,
        [sessionIds],
      );
      return result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        messages: Number(row.messages),
        lastMessageAt: row.last_message_at?.toISOString() ?? null,
      }));
    },
    async memoryCounts(sessionId) {
      const tables = await client.query<{ ok: boolean }>(MEMORY_TABLES_SQL);
      if (tables.rows[0]?.ok !== true) return null;
      const kinds = await client.query<{ kind: string; n: string }>(MEMORY_KIND_SQL, [sessionId]);
      const optouts = await client.query<{ n: string }>(MEMORY_OPTOUT_SQL, [sessionId]);
      const byKind: Record<string, number> = {};
      for (const row of kinds.rows) byKind[row.kind] = Number(row.n);
      return {
        total: Object.values(byKind).reduce((sum, n) => sum + n, 0),
        byKind,
        optouts: Number(optouts.rows[0]?.n ?? 0),
      };
    },
    async extractCalls(sessionId) {
      const result = await client.query<{ n: string }>(EXTRACT_CALLS_SQL, [sessionId]);
      return Number(result.rows[0]?.n ?? 0);
    },
    close: () => client.end(),
  };
}
